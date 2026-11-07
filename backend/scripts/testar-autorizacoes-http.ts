/**
 * Testa a Autorização de Imagens por HTTP, contra o app real subido numa porta
 * livre (banco local prisma/dev.db, arquivos em disco).
 *
 *   STORAGE_PROVIDER=local npx tsx scripts/testar-autorizacoes-http.ts
 *
 * Guardas: só GESTOR/ADMIN publica, confere e vê o painel; só quem tem o módulo
 * `autorizacao_imagem` assina; o assinado só entra depois de baixar o modelo, se
 * for PDF de verdade, COM assinatura digital e diferente do modelo; um envio por
 * vez (novo só após recusa); o assinado só é lido pelo dono e pela gestão; tudo
 * fica no log com data (baixou, enviou, conferiu).
 * Excesso: PDF assinado é aceito, reenvio após recusa vale, e apagar o usuário
 * não apaga documento nem histórico.
 * Tudo com título "TESTE-AUT…"; limpa ao final; sai ≠ 0 se falhar.
 *
 * ⚠️ O PDF "assinado" daqui é sintético (tem o dicionário de assinatura, não uma
 * assinatura válida). A prova com um PDF real do gov.br é manual.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { LOCAL_ROOT } from '../src/services/storage/LocalDiskProvider.js';

const PREFIXO_EMAIL = 'teste-aut-';
const PREFIXO = 'TESTE-AUT';
const MODULO = 'autorizacao_imagem';

const MODELO = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% Autorizacao de uso de imagem - modelo\n%%EOF\n', 'latin1');
// Mesma ordem do PDF assinado no gov.br (conferido em 06/11/2026): /M vem ANTES de um
// /Contents com ~33 KB de hex, e /ByteRange só depois. Uma janela curta em volta do
// /ByteRange não alcança o /M.
const ASSINATURA = `\n9 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached /M (D:20261106153000-03'00') /Reference [10 0 R] /Contents <${'30'.repeat(20_000)}> /ByteRange [0 90 200 40] >>\nendobj\n%%EOF\n`;
const ASSINADO = Buffer.concat([MODELO, Buffer.from(ASSINATURA, 'latin1')]);
const ASSINADO_2 = Buffer.concat([ASSINADO, Buffer.from('% segunda via\n', 'latin1')]);
const SEM_ASSINATURA = Buffer.concat([MODELO, Buffer.from('% preenchido a mao e digitalizado\n', 'latin1')]);
const FALSO = Buffer.from('isto nao e um pdf');

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  const docs = await prisma.autorizacaoDocumento.findMany({ where: { titulo: { startsWith: PREFIXO } }, select: { id: true } });
  const ids = docs.map((d) => d.id);
  await prisma.autorizacaoEvento.deleteMany({ where: { documentoId: { in: ids } } });
  await prisma.autorizacaoEnvio.deleteMany({ where: { documentoId: { in: ids } } });
  await prisma.autorizacaoDocumento.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) await fsp.rm(path.join(LOCAL_ROOT, 'AutorizacoesImagem', id), { recursive: true, force: true });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

interface Conta { id: string; token: string }

async function criarUsuario(sufixo: string, role: string, modules: string[] = []): Promise<Conta> {
  const u = await prisma.user.create({
    data: { name: `${PREFIXO} ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`, passwordHash: 'x', role, isActive: true, modules: JSON.stringify(modules) },
  });
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name, modules }, env.jwtSecret, { expiresIn: '1h' });
  return { id: u.id, token };
}

interface Minha {
  id: string; titulo: string; estado: string; baixouEm: string | null;
  envio: { id: string; status: string; motivoRecusa: string | null; dataDeclaradaPdf: string | null; createdAt: string } | null;
}
interface Envio { id: string; status: string; dataDeclaradaPdf: string | null; conferidoPorNome: string | null }
interface Painel { colaboradores: Array<{ usuarioId: string; nome: string; estado: string; baixouEm: string | null }>; eventos: Array<{ tipo: string; atorNome: string }> }

async function main() {
  if (env.storageProvider !== 'local') throw new Error('Este teste exige STORAGE_PROVIDER=local');
  await limpar();

  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/autorizacoes`;
  const raiz = base.replace('/autorizacoes', '');
  const auth = (c: Conta | null): Record<string, string> => (c ? { Authorization: `Bearer ${c.token}` } : {});
  const chamar = (c: Conta | null, method: string, rota: string, body?: unknown) => fetch(`${base}${rota}`, {
    method,
    headers: { ...auth(c), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const enviar = (c: Conta | null, rota: string, arquivo: Buffer | null, campos: Record<string, string> = {}, nome = 'autorização assinada.pdf') => {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    if (arquivo) form.append('arquivo', new Blob([new Uint8Array(arquivo)], { type: 'application/pdf' }), nome);
    return fetch(`${base}${rota}`, { method: 'POST', headers: auth(c), body: form });
  };
  const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());

  const gestor = await criarUsuario('gestor', 'GESTOR');
  const admin = await criarUsuario('admin', 'ADMIN');
  const ana = await criarUsuario('ana', 'USER', [MODULO]);
  const bia = await criarUsuario('bia', 'USER', [MODULO]);
  const semModulo = await criarUsuario('sem-modulo', 'USER');
  const adminComModulo = await criarUsuario('admin-com-modulo', 'ADMIN', [MODULO]);

  let doc = '';
  const envios = () => prisma.autorizacaoEnvio.count({ where: { documentoId: doc } });
  const eventos = (tipo: string, atorId?: string) => prisma.autorizacaoEvento.count({ where: { documentoId: doc, tipo, ...(atorId ? { atorId } : {}) } });
  const minha = async (c: Conta) => (await (await chamar(c, 'GET', '/minhas')).json() as Minha[]).find((d) => d.id === doc);

  try {
    console.log('Publicar');
    await teste('sem token → 401', async () => {
      assert.equal((await chamar(null, 'GET', '/minhas')).status, 401);
    });
    await teste('USER NÃO publica, nem tendo o módulo (403)', async () => {
      assert.equal((await enviar(ana, '/gestao', MODELO, { titulo: `${PREFIXO} invasão` })).status, 403);
      assert.equal(await prisma.autorizacaoDocumento.count({ where: { titulo: { startsWith: PREFIXO } } }), 0);
    });
    await teste('modelo que não é PDF, ou sem título, é recusado (400)', async () => {
      assert.equal((await enviar(gestor, '/gestao', FALSO, { titulo: `${PREFIXO} falso` })).status, 400);
      assert.equal((await enviar(gestor, '/gestao', MODELO, {})).status, 400);
      assert.equal((await enviar(gestor, '/gestao', null, { titulo: `${PREFIXO} sem arquivo` })).status, 400);
      assert.equal(await prisma.autorizacaoDocumento.count({ where: { titulo: { startsWith: PREFIXO } } }), 0);
    });
    await teste('GESTOR publica o modelo em PDF (201)', async () => {
      const r = await enviar(gestor, '/gestao', MODELO, { titulo: `${PREFIXO} uso de imagem 2026`, descricao: 'Assine pelo gov.br.' }, 'modelo autorização.pdf');
      assert.equal(r.status, 201);
      doc = (await r.json() as { id: string }).id;
    });
    await teste('ADMIN também publica (201)', async () => {
      assert.equal((await enviar(admin, '/gestao', MODELO, { titulo: `${PREFIXO} outro` })).status, 201);
    });

    console.log('Colaborador');
    await teste('sem o módulo NÃO vê nem baixa (403); GESTOR sem módulo não assina (403)', async () => {
      assert.equal((await chamar(semModulo, 'GET', '/minhas')).status, 403);
      assert.equal((await chamar(semModulo, 'GET', `/${doc}/modelo`)).status, 403);
      assert.equal((await enviar(semModulo, `/${doc}/envio`, ASSINADO)).status, 403);
      assert.equal((await enviar(gestor, `/${doc}/envio`, ASSINADO)).status, 403);
    });
    await teste('quem tem o módulo vê o documento como "não baixou"', async () => {
      const d = await minha(ana);
      assert.equal(d?.estado, 'NAO_BAIXOU');
      assert.equal(d?.baixouEm, null);
    });
    await teste('enviar o assinado ANTES de baixar o modelo → 409, nada gravado', async () => {
      assert.equal((await enviar(ana, `/${doc}/envio`, ASSINADO)).status, 409);
      assert.equal(await envios(), 0);
    });
    await teste('baixar o modelo devolve o mesmo arquivo e registra quem e quando', async () => {
      const r = await chamar(ana, 'GET', `/${doc}/modelo`);
      assert.equal(r.status, 200);
      assert.ok((await bytes(r)).equals(MODELO));
      assert.equal(await eventos('BAIXOU_MODELO', ana.id), 1);
      const d = await minha(ana);
      assert.equal(d?.estado, 'BAIXOU');
      assert.ok(d?.baixouEm);
    });
    await teste('"PDF" falso, PDF sem assinatura e o próprio modelo são recusados (400)', async () => {
      assert.equal((await enviar(ana, `/${doc}/envio`, FALSO)).status, 400);
      const semAss = await enviar(ana, `/${doc}/envio`, SEM_ASSINATURA);
      assert.equal(semAss.status, 400);
      assert.match((await semAss.json() as { error: string }).error, /assinatura/i);
      assert.equal((await enviar(ana, `/${doc}/envio`, MODELO)).status, 400);
      assert.equal((await enviar(ana, `/${doc}/envio`, null)).status, 400);
      assert.equal(await envios(), 0);
    });
    await teste('arquivo que não é PDF, mesmo trazendo o texto de uma assinatura, é recusado (400)', async () => {
      const disfarce = Buffer.from(`qualquer coisa${ASSINATURA}`, 'latin1');
      const r = await enviar(ana, `/${doc}/envio`, disfarce);
      assert.equal(r.status, 400);
      assert.match((await r.json() as { error: string }).error, /PDF/);
      assert.equal(await envios(), 0);
    });
    await teste('modelo que já vem assinado pela escola: devolver o mesmo arquivo não vale (400)', async () => {
      const r = await enviar(gestor, '/gestao', ASSINADO, { titulo: `${PREFIXO} modelo já assinado` });
      const outro = (await r.json() as { id: string }).id;
      assert.equal((await chamar(ana, 'GET', `/${outro}/modelo`)).status, 200);
      const igual = await enviar(ana, `/${outro}/envio`, ASSINADO);
      assert.equal(igual.status, 400);
      assert.match((await igual.json() as { error: string }).error, /modelo sem assinar/);
      assert.equal(await prisma.autorizacaoEnvio.count({ where: { documentoId: outro } }), 0);
    });
    let envioAna = '';
    await teste('PDF com assinatura digital é aceito (201), fica aguardando conferência, com a data declarada no PDF', async () => {
      const r = await enviar(ana, `/${doc}/envio`, ASSINADO);
      assert.equal(r.status, 201);
      const e = await r.json() as Envio;
      assert.equal(e.status, 'AGUARDANDO');
      assert.equal(e.dataDeclaradaPdf, '2026-11-06T18:30:00.000Z');
      envioAna = e.id;
      assert.equal(await eventos('ENVIOU_ASSINADO', ana.id), 1);
      assert.equal((await minha(ana))?.estado, 'AGUARDANDO');
    });
    await teste('segundo envio enquanto o primeiro aguarda → 409', async () => {
      assert.equal((await enviar(ana, `/${doc}/envio`, ASSINADO_2)).status, 409);
      assert.equal(await envios(), 1);
    });

    console.log('Sigilo do assinado');
    await teste('quem assinou e depois perdeu o módulo ainda baixa o PRÓPRIO arquivo', async () => {
      await prisma.user.update({ where: { id: ana.id }, data: { modules: '[]' } });
      const r = await chamar(ana, 'GET', `/envios/${envioAna}/arquivo`);
      await prisma.user.update({ where: { id: ana.id }, data: { modules: JSON.stringify([MODULO]) } });
      assert.equal(r.status, 200);
    });
    await teste('outro colaborador e quem não tem módulo NÃO leem o assinado (403)', async () => {
      assert.equal((await chamar(bia, 'GET', `/envios/${envioAna}/arquivo`)).status, 403);
      assert.equal((await chamar(semModulo, 'GET', `/envios/${envioAna}/arquivo`)).status, 403);
      assert.equal((await chamar(null, 'GET', `/envios/${envioAna}/arquivo`)).status, 401);
    });
    await teste('o dono baixa o próprio assinado, com os mesmos bytes', async () => {
      const r = await chamar(ana, 'GET', `/envios/${envioAna}/arquivo`);
      assert.equal(r.status, 200);
      assert.ok((await bytes(r)).equals(ASSINADO));
    });
    await teste('a gestão baixa o assinado e isso fica no log', async () => {
      const r = await chamar(gestor, 'GET', `/envios/${envioAna}/arquivo`);
      assert.equal(r.status, 200);
      assert.ok((await bytes(r)).equals(ASSINADO));
      assert.equal(await eventos('BAIXOU_ASSINADO', gestor.id), 1);
    });

    console.log('Conferência');
    await teste('colaborador NÃO vê o painel, não valida nem recusa (403)', async () => {
      assert.equal((await chamar(ana, 'GET', '/gestao')).status, 403);
      assert.equal((await chamar(ana, 'GET', `/gestao/${doc}`)).status, 403);
      assert.equal((await chamar(ana, 'POST', `/gestao/envios/${envioAna}/validar`)).status, 403);
      assert.equal((await chamar(ana, 'POST', `/gestao/envios/${envioAna}/recusar`, { motivo: 'porque sim' })).status, 403);
      assert.equal((await prisma.autorizacaoEnvio.findUnique({ where: { id: envioAna } }))!.status, 'AGUARDANDO');
    });
    await teste('recusar exige motivo (400); com motivo, o colaborador vê o motivo', async () => {
      assert.equal((await chamar(gestor, 'POST', `/gestao/envios/${envioAna}/recusar`, {})).status, 400);
      assert.equal((await chamar(gestor, 'POST', `/gestao/envios/${envioAna}/recusar`, { motivo: 'Assinatura não confere no validador.' })).status, 200);
      const d = await minha(ana);
      assert.equal(d?.estado, 'RECUSADO');
      assert.equal(d?.envio?.motivoRecusa, 'Assinatura não confere no validador.');
      assert.equal(await eventos('RECUSOU', gestor.id), 1);
    });
    await teste('depois da recusa o colaborador reenvia (201) e o envio recusado continua guardado', async () => {
      const r = await enviar(ana, `/${doc}/envio`, ASSINADO_2);
      assert.equal(r.status, 201);
      envioAna = (await r.json() as Envio).id;
      assert.equal(await envios(), 2);
      assert.equal(await prisma.autorizacaoEnvio.count({ where: { documentoId: doc, status: 'RECUSADO' } }), 1);
    });
    await teste('GESTOR valida: fica VALIDADO com quem conferiu e quando', async () => {
      const r = await chamar(gestor, 'POST', `/gestao/envios/${envioAna}/validar`);
      assert.equal(r.status, 200);
      const e = await prisma.autorizacaoEnvio.findUnique({ where: { id: envioAna } });
      assert.equal(e!.status, 'VALIDADO');
      assert.equal(e!.conferidoPorNome, `${PREFIXO} gestor`);
      assert.ok(e!.conferidoEm);
      assert.equal(await eventos('VALIDOU', gestor.id), 1);
      assert.equal((await minha(ana))?.estado, 'VALIDADO');
    });
    await teste('conferir de novo → 409; reenviar depois de validado → 409', async () => {
      assert.equal((await chamar(gestor, 'POST', `/gestao/envios/${envioAna}/validar`)).status, 409);
      assert.equal((await chamar(gestor, 'POST', `/gestao/envios/${envioAna}/recusar`, { motivo: 'mudei de ideia' })).status, 409);
      assert.equal((await enviar(ana, `/${doc}/envio`, ASSINADO)).status, 409);
      assert.equal(await envios(), 2);
    });
    await teste('o painel lista quem tem o módulo, cada um no seu estado, e o histórico', async () => {
      const r = await chamar(gestor, 'GET', `/gestao/${doc}`);
      assert.equal(r.status, 200);
      const p = await r.json() as Painel;
      const de = (c: Conta) => p.colaboradores.find((x) => x.usuarioId === c.id);
      assert.equal(de(ana)?.estado, 'VALIDADO');
      assert.ok(de(ana)?.baixouEm);
      assert.equal(de(bia)?.estado, 'NAO_BAIXOU');
      assert.equal(de(semModulo), undefined, 'quem não tem o módulo não deve assinar');
      assert.equal(de(admin), undefined, 'ADMIN não entra na lista');
      assert.equal(de(adminComModulo), undefined, 'ADMIN não entra na lista nem com o módulo gravado na conta');
      assert.deepEqual([...new Set(p.eventos.map((e) => e.tipo))].sort(), ['BAIXOU_ASSINADO', 'BAIXOU_MODELO', 'ENVIOU_ASSINADO', 'RECUSOU', 'VALIDOU']);
    });

    console.log('Encerrar e excluir usuário');
    await teste('documento encerrado: quem ainda não enviou não vê mais e não envia (409)', async () => {
      assert.equal((await chamar(bia, 'GET', `/${doc}/modelo`)).status, 200);
      assert.equal((await chamar(ana, 'POST', `/gestao/${doc}/encerrar`, { encerrado: true })).status, 403);
      assert.equal((await chamar(gestor, 'POST', `/gestao/${doc}/encerrar`, { encerrado: true })).status, 200);
      assert.equal(await minha(bia), undefined);
      assert.equal((await enviar(bia, `/${doc}/envio`, ASSINADO)).status, 409);
      assert.equal((await minha(ana))?.estado, 'VALIDADO', 'quem já assinou continua vendo o seu');
    });
    await teste('apagar o usuário funciona; o assinado e o histórico continuam', async () => {
      assert.equal((await fetch(`${raiz}/users/${ana.id}`, { method: 'DELETE', headers: auth(admin) })).status, 204);
      const e = await prisma.autorizacaoEnvio.findUnique({ where: { id: envioAna } });
      assert.ok(e, 'o envio não pode sumir com a conta');
      assert.equal(e.usuarioNome, `${PREFIXO} ana`);
      assert.equal(await eventos('BAIXOU_MODELO', ana.id), 1);
      const r = await chamar(gestor, 'GET', `/envios/${envioAna}/arquivo`);
      assert.equal(r.status, 200);
      assert.ok((await bytes(r)).equals(ASSINADO_2));
      const p = await (await chamar(gestor, 'GET', `/gestao/${doc}`)).json() as Painel;
      assert.equal(p.colaboradores.find((x) => x.usuarioId === ana.id)?.estado, 'VALIDADO', 'quem assinou segue no painel mesmo sem conta');
    });
    await teste('assinado acima de 15 MB → 413 dizendo 15 MB', async () => {
      const r = await enviar(bia, `/${doc}/envio`, Buffer.concat([ASSINADO, Buffer.alloc(15 * 1024 * 1024 + 10)]));
      assert.equal(r.status, 413);
      assert.match((await r.json() as { error: string }).error, /15 ?MB/);
    });
  } finally {
    await limpar();
    server.close();
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? '\nTudo verde.' : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
