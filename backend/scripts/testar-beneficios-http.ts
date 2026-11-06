/**
 * Testa a Central de Benefícios por HTTP, contra o app real subido numa porta
 * livre (banco local prisma/dev.db).
 *
 *   npx tsx scripts/testar-beneficios-http.ts
 *
 * Guardas: só ADMIN cadastra/edita/apaga; logo só PNG/JPG/WEBP conferido pelo
 * CONTEÚDO (SVG e "PNG" falso são recusados); link só http/https; benefício
 * oculto não aparece nem entrega o logo a quem não é ADMIN; limite de 1 MB.
 * Excesso: qualquer logado lê; logo real é aceito; cadastro sem logo e sem link vale.
 * Tudo com prefixo "TESTE-BEN"; limpa ao final; sai ≠ 0 se falhar.
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';

const PREFIXO_EMAIL = 'teste-ben-';
const PREFIXO_NOME = 'TESTE-BEN';

// PNG 1×1 de verdade.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const FALSO = Buffer.from('isto nao e uma imagem, so tem nome de png');

let falhas = 0;
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ✓ ${nome}`); } catch (err) {
    falhas++; console.log(`  ✗ ${nome}`); console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function limpar() {
  await prisma.beneficio.deleteMany({ where: { nome: { startsWith: PREFIXO_NOME } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIXO_EMAIL } } });
}

interface Conta { id: string; token: string }

async function criarUsuario(sufixo: string, role: string): Promise<Conta> {
  const u = await prisma.user.create({
    data: { name: `${PREFIXO_NOME} ${sufixo}`, email: `${PREFIXO_EMAIL}${sufixo}@gmail.com`, passwordHash: 'x', role, isActive: true, modules: '[]' },
  });
  const token = jwt.sign({ sub: u.id, email: u.email, role: u.role, name: u.name, modules: [] }, env.jwtSecret, { expiresIn: '1h' });
  return { id: u.id, token };
}

interface Arquivo { conteudo: Buffer; nome: string; mime: string }

async function main() {
  await limpar();

  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const auth = (c: Conta | null): Record<string, string> => (c ? { Authorization: `Bearer ${c.token}` } : {});
  const chamar = (c: Conta | null, method: string, rota: string) => fetch(`${base}${rota}`, { method, headers: auth(c) });
  const enviar = (c: Conta | null, method: string, rota: string, campos: Record<string, string>, logo?: Arquivo) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    if (logo) form.append('logo', new Blob([new Uint8Array(logo.conteudo)], { type: logo.mime }), logo.nome);
    return fetch(`${base}${rota}`, { method, headers: auth(c), body: form });
  };
  const total = () => prisma.beneficio.count({ where: { nome: { startsWith: PREFIXO_NOME } } });

  const admin = await criarUsuario('admin', 'ADMIN');
  const gestor = await criarUsuario('gestor', 'GESTOR');
  const comum = await criarUsuario('comum', 'USER');

  const campos = (sufixo: string, extra: Record<string, string> = {}) => ({
    nome: `${PREFIXO_NOME} ${sufixo}`, descricao: 'Desconto para colaboradores da escola.', ...extra,
  });

  try {
    console.log('Quem cadastra');
    await teste('sem token → 401', async () => {
      assert.equal((await chamar(null, 'GET', '/beneficios')).status, 401);
    });
    await teste('USER NÃO cadastra (403) e nada é gravado', async () => {
      assert.equal((await enviar(comum, 'POST', '/beneficios', campos('user'))).status, 403);
      assert.equal(await total(), 0);
    });
    await teste('GESTOR NÃO cadastra (403)', async () => {
      assert.equal((await enviar(gestor, 'POST', '/beneficios', campos('gestor'))).status, 403);
      assert.equal(await total(), 0);
    });

    let id = '';
    await teste('ADMIN cadastra com logo PNG real e link https (201)', async () => {
      const r = await enviar(admin, 'POST', '/beneficios', campos('farmacia', { link: 'https://parceiro.example.com/csp' }), { conteudo: PNG, nome: 'logo.png', mime: 'image/png' });
      assert.equal(r.status, 201);
      const b = await r.json() as { id: string; temLogo: boolean; ativo: boolean; logo?: unknown };
      assert.equal(b.temLogo, true);
      assert.equal(b.ativo, true);
      assert.equal(b.logo, undefined, 'a resposta não deve trazer os bytes do logo');
      id = b.id;
    });
    await teste('ADMIN cadastra sem logo e sem link (201)', async () => {
      const r = await enviar(admin, 'POST', '/beneficios', campos('sem-logo'));
      assert.equal(r.status, 201);
      assert.equal((await r.json() as { temLogo: boolean }).temLogo, false);
    });
    await teste('logo JPG real é aceito (201)', async () => {
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('jpg'), { conteudo: JPEG, nome: 'logo.jpg', mime: 'image/jpeg' })).status, 201);
    });

    console.log('Logo e link');
    await teste('"PNG" falso (só nome e mimetype) é recusado (400)', async () => {
      const antes = await total();
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('falso'), { conteudo: FALSO, nome: 'logo.png', mime: 'image/png' })).status, 400);
      assert.equal(await total(), antes);
    });
    await teste('SVG é recusado mesmo declarado como PNG (400)', async () => {
      const antes = await total();
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('svg'), { conteudo: SVG, nome: 'logo.svg', mime: 'image/svg+xml' })).status, 400);
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('svg2'), { conteudo: SVG, nome: 'logo.png', mime: 'image/png' })).status, 400);
      assert.equal(await total(), antes);
    });
    await teste('PDF de verdade não serve de logo (400)', async () => {
      const antes = await total();
      const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('pdf'), { conteudo: pdf, nome: 'logo.png', mime: 'image/png' })).status, 400);
      assert.equal(await total(), antes);
    });
    await teste('logo acima de 1 MB → 413 dizendo 1 MB', async () => {
      const grande = Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10)]);
      const r = await enviar(admin, 'POST', '/beneficios', campos('grande'), { conteudo: grande, nome: 'logo.png', mime: 'image/png' });
      assert.equal(r.status, 413);
      assert.match((await r.json() as { error: string }).error, /1 ?MB/);
    });
    await teste('link javascript: e data: são recusados (400)', async () => {
      const antes = await total();
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('js', { link: 'javascript:alert(1)' }))).status, 400);
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('data', { link: 'data:text/html,<b>x</b>' }))).status, 400);
      assert.equal(await total(), antes);
    });
    await teste('link http simples é aceito (201)', async () => {
      assert.equal((await enviar(admin, 'POST', '/beneficios', campos('http', { link: 'http://parceiro.example.com' }))).status, 201);
    });

    console.log('Leitura');
    await teste('USER lista os ativos, sem os bytes do logo', async () => {
      const r = await chamar(comum, 'GET', '/beneficios');
      assert.equal(r.status, 200);
      const lista = await r.json() as Array<{ id: string; logo?: unknown; link: string | null }>;
      const item = lista.find((b) => b.id === id);
      assert.ok(item, 'benefício ativo deve aparecer para USER');
      assert.equal(item.logo, undefined);
      assert.equal(item.link, 'https://parceiro.example.com/csp');
    });
    await teste('USER recebe o logo com o tipo certo e os mesmos bytes', async () => {
      const r = await chamar(comum, 'GET', `/beneficios/${id}/logo`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'image/png');
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(PNG));
    });
    await teste('logo sem token → 401', async () => {
      assert.equal((await chamar(null, 'GET', `/beneficios/${id}/logo`)).status, 401);
    });

    console.log('Edição e ocultar');
    await teste('USER e GESTOR NÃO editam nem apagam (403)', async () => {
      assert.equal((await enviar(comum, 'PUT', `/beneficios/${id}`, { nome: `${PREFIXO_NOME} invadido` })).status, 403);
      assert.equal((await chamar(comum, 'DELETE', `/beneficios/${id}`)).status, 403);
      assert.equal((await enviar(gestor, 'PUT', `/beneficios/${id}`, { ativo: 'false' })).status, 403);
      const b = await prisma.beneficio.findUnique({ where: { id } });
      assert.equal(b!.nome, `${PREFIXO_NOME} farmacia`);
      assert.equal(b!.ativo, true);
    });
    await teste('ADMIN edita o texto e o logo continua', async () => {
      const r = await enviar(admin, 'PUT', `/beneficios/${id}`, { descricao: 'Texto novo.' });
      assert.equal(r.status, 200);
      const b = await r.json() as { descricao: string; temLogo: boolean };
      assert.equal(b.descricao, 'Texto novo.');
      assert.equal(b.temLogo, true);
    });
    await teste('editar com link inválido ou logo falso é recusado e nada muda (400)', async () => {
      assert.equal((await enviar(admin, 'PUT', `/beneficios/${id}`, { link: 'javascript:alert(1)' })).status, 400);
      assert.equal((await enviar(admin, 'PUT', `/beneficios/${id}`, {}, { conteudo: FALSO, nome: 'logo.png', mime: 'image/png' })).status, 400);
      const b = await prisma.beneficio.findUnique({ where: { id } });
      assert.equal(b!.link, 'https://parceiro.example.com/csp');
      assert.ok(Buffer.from(b!.logo!).equals(PNG));
    });
    await teste('ADMIN oculta: some para USER (lista e logo 404), ADMIN segue vendo', async () => {
      assert.equal((await enviar(admin, 'PUT', `/beneficios/${id}`, { ativo: 'false' })).status, 200);
      const doUser = await (await chamar(comum, 'GET', '/beneficios')).json() as Array<{ id: string }>;
      assert.equal(doUser.some((b) => b.id === id), false);
      assert.equal((await chamar(comum, 'GET', `/beneficios/${id}/logo`)).status, 404);
      const doAdmin = await (await chamar(admin, 'GET', '/beneficios')).json() as Array<{ id: string; ativo: boolean }>;
      assert.equal(doAdmin.find((b) => b.id === id)?.ativo, false);
      assert.equal((await chamar(admin, 'GET', `/beneficios/${id}/logo`)).status, 200);
    });
    await teste('ADMIN remove o logo e depois apaga (204)', async () => {
      const r = await enviar(admin, 'PUT', `/beneficios/${id}`, { removerLogo: 'true' });
      assert.equal((await r.json() as { temLogo: boolean }).temLogo, false);
      assert.equal((await chamar(admin, 'GET', `/beneficios/${id}/logo`)).status, 404);
      assert.equal((await chamar(admin, 'DELETE', `/beneficios/${id}`)).status, 204);
      assert.equal(await prisma.beneficio.findUnique({ where: { id } }), null);
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
