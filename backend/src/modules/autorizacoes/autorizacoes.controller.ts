import { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { parseModules } from '../../lib/modules.js';
import { detectarTipo } from '../../lib/uploadSeguro.js';
import { storage } from '../../services/storage/index.js';
import { temAssinaturaDigital, dataDeclaradaNaAssinatura } from './autorizacoes.pdf.js';

export const MODULO_AUTORIZACAO = 'autorizacao_imagem';
export const LIMITE_PDF_MB = 15;

const PASTA = 'AutorizacoesImagem';
// O temporário nasce na raiz de uploads: o storage local move por rename, que
// não atravessa volumes (o /tmp do container fica em outro).
const DIR_TEMP = path.resolve(process.cwd(), env.uploadDir);

const ehGestao = (req: Request) => req.user!.role === 'ADMIN' || req.user!.role === 'GESTOR';
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

/** Nome de exibição seguro: sem caminho nem caracteres de controle, sempre .pdf. */
function nomeSeguro(original: string, padrao: string): string {
  const base = path.basename(original || '').replace(/[\u0000-\u001f\u007f"\\/]/g, '').trim().slice(0, 150);
  if (!base) return padrao;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

async function gravarNoStorage(chave: string, conteudo: Buffer): Promise<string> {
  await fsp.mkdir(DIR_TEMP, { recursive: true });
  const tmp = path.join(DIR_TEMP, `tmp-autorizacao-${randomUUID()}`);
  await fsp.writeFile(tmp, conteudo);
  try {
    return await storage.save(chave, tmp, 'application/pdf');
  } catch (err) {
    await fsp.rm(tmp, { force: true });
    throw err;
  }
}

function entregarPdf(res: Response, next: NextFunction, storageKey: string, nome: string, sizeBytes: number): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(sizeBytes));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = storage.createReadStream(storageKey);
  stream.on('error', next);
  stream.pipe(res);
}

function registrar(req: Request, documentoId: string, tipo: string, envioId?: string) {
  return prisma.autorizacaoEvento.create({
    data: { documentoId, envioId: envioId ?? null, tipo, atorId: req.user!.sub, atorNome: req.user!.name, atorEmail: req.user!.email, ip: req.ip ?? null },
  });
}

const camposEnvio = {
  id: true, documentoId: true, usuarioId: true, usuarioNome: true, usuarioEmail: true, arquivoNome: true, sizeBytes: true,
  dataDeclaradaPdf: true, status: true, conferidoPorNome: true, conferidoEm: true, motivoRecusa: true, createdAt: true,
} as const;

type Estado = 'NAO_BAIXOU' | 'BAIXOU' | 'AGUARDANDO' | 'VALIDADO' | 'RECUSADO';
const estadoDe = (baixouEm: Date | null, envio: { status: string } | null): Estado =>
  (envio ? (envio.status as Estado) : baixouEm ? 'BAIXOU' : 'NAO_BAIXOU');

// ─── Colaborador ────────────────────────────────────────────────────────────

/** Documentos que a pessoa precisa assinar (abertos) ou já assinou, com o seu estado em cada um. */
export async function minhas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const eu = req.user!.sub;
    const [docs, envios, downloads] = await Promise.all([
      prisma.autorizacaoDocumento.findMany({
        select: { id: true, titulo: true, descricao: true, arquivoNome: true, encerrado: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.autorizacaoEnvio.findMany({ where: { usuarioId: eu }, select: camposEnvio, orderBy: { createdAt: 'desc' } }),
      prisma.autorizacaoEvento.findMany({ where: { atorId: eu, tipo: 'BAIXOU_MODELO' }, select: { documentoId: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const lista = docs
      .map((d) => {
        const envio = envios.find((e) => e.documentoId === d.id) ?? null; // o mais recente
        const baixouEm = downloads.find((x) => x.documentoId === d.id)?.createdAt ?? null; // o primeiro
        return { ...d, baixouEm, envio, estado: estadoDe(baixouEm, envio) };
      })
      .filter((d) => !d.encerrado || d.envio);
    res.json(lista);
  } catch (err) { next(err); }
}

export async function baixarModelo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await prisma.autorizacaoDocumento.findUnique({ where: { id: String(req.params.docId) } });
    if (!doc) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
    if (!(await storage.exists(doc.storageKey))) { res.status(410).json({ error: 'Arquivo ausente no armazenamento' }); return; }
    await registrar(req, doc.id, 'BAIXOU_MODELO');
    entregarPdf(res, next, doc.storageKey, doc.arquivoNome, doc.sizeBytes);
  } catch (err) { next(err); }
}

export async function enviarAssinado(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const eu = req.user!.sub;
    const doc = await prisma.autorizacaoDocumento.findUnique({ where: { id: String(req.params.docId) } });
    if (!doc) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
    if (doc.encerrado) { res.status(409).json({ error: 'Este documento foi encerrado e não recebe mais envios.' }); return; }

    const arquivo = req.file;
    if (!arquivo) { res.status(400).json({ error: 'Envie o arquivo assinado em PDF.' }); return; }
    if (detectarTipo(arquivo.buffer) !== 'application/pdf') { res.status(400).json({ error: 'O arquivo precisa ser um PDF.' }); return; }

    const baixou = await prisma.autorizacaoEvento.findFirst({ where: { documentoId: doc.id, atorId: eu, tipo: 'BAIXOU_MODELO' }, select: { id: true } });
    if (!baixou) { res.status(409).json({ error: 'Baixe o modelo antes de enviar o arquivo assinado.' }); return; }

    const hash = sha256(arquivo.buffer);
    if (hash === doc.sha256) { res.status(400).json({ error: 'Este é o modelo sem assinar. Assine pelo gov.br e envie o arquivo assinado.' }); return; }
    if (!temAssinaturaDigital(arquivo.buffer)) {
      res.status(400).json({ error: 'Este PDF não tem assinatura digital. Assine pelo gov.br e envie o arquivo que o assinador devolve (foto ou digitalização não servem).' });
      return;
    }

    const emAberto = await prisma.autorizacaoEnvio.findFirst({
      where: { documentoId: doc.id, usuarioId: eu, status: { in: ['AGUARDANDO', 'VALIDADO'] } },
      select: { status: true },
    });
    if (emAberto) {
      res.status(409).json({ error: emAberto.status === 'VALIDADO' ? 'Sua autorização já foi validada.' : 'Você já enviou o arquivo assinado. Aguarde a conferência.' });
      return;
    }

    const storageKey = await gravarNoStorage(`${PASTA}/${doc.id}/assinados/${randomUUID()}.pdf`, arquivo.buffer);
    const envio = await prisma.autorizacaoEnvio.create({
      data: {
        documentoId: doc.id,
        usuarioId: eu,
        usuarioNome: req.user!.name,
        usuarioEmail: req.user!.email,
        arquivoNome: nomeSeguro(arquivo.originalname, 'autorizacao-assinada.pdf'),
        storageKey,
        sizeBytes: arquivo.size,
        sha256: hash,
        dataDeclaradaPdf: dataDeclaradaNaAssinatura(arquivo.buffer),
      },
      select: camposEnvio,
    });
    await registrar(req, doc.id, 'ENVIOU_ASSINADO', envio.id);
    res.status(201).json(envio);
  } catch (err) { next(err); }
}

/** O assinado só é entregue ao próprio colaborador e à gestão (que fica registrada no log). */
export async function baixarAssinado(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const envio = await prisma.autorizacaoEnvio.findUnique({ where: { id: String(req.params.id) } });
    if (!envio) { res.status(404).json({ error: 'Envio não encontrado' }); return; }
    const gestao = ehGestao(req);
    if (!gestao && envio.usuarioId !== req.user!.sub) { res.status(403).json({ error: 'Acesso negado' }); return; }
    if (!(await storage.exists(envio.storageKey))) { res.status(410).json({ error: 'Arquivo ausente no armazenamento' }); return; }
    if (gestao && envio.usuarioId !== req.user!.sub) await registrar(req, envio.documentoId, 'BAIXOU_ASSINADO', envio.id);
    entregarPdf(res, next, envio.storageKey, envio.arquivoNome, envio.sizeBytes);
  } catch (err) { next(err); }
}

// ─── Gestão (ADMIN e GESTOR) ────────────────────────────────────────────────

const publicarSchema = z.object({
  titulo: z.string().trim().min(3).max(150),
  descricao: z.string().trim().max(1000).optional(),
});

export async function publicar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = publicarSchema.parse(req.body ?? {});
    const arquivo = req.file;
    if (!arquivo) { res.status(400).json({ error: 'Envie o modelo em PDF.' }); return; }
    if (detectarTipo(arquivo.buffer) !== 'application/pdf') { res.status(400).json({ error: 'O modelo precisa ser um PDF.' }); return; }

    const id = randomUUID();
    const storageKey = await gravarNoStorage(`${PASTA}/${id}/modelo-${randomUUID()}.pdf`, arquivo.buffer);
    const doc = await prisma.autorizacaoDocumento.create({
      data: {
        id,
        titulo: data.titulo,
        descricao: data.descricao || null,
        arquivoNome: nomeSeguro(arquivo.originalname, 'autorizacao-de-imagem.pdf'),
        storageKey,
        sizeBytes: arquivo.size,
        sha256: sha256(arquivo.buffer),
        publicadoPorId: req.user!.sub,
        publicadoPorNome: req.user!.name,
      },
      select: { id: true, titulo: true, descricao: true, arquivoNome: true, encerrado: true, createdAt: true, publicadoPorNome: true },
    });
    res.status(201).json(doc);
  } catch (err) { next(err); }
}

export async function listarGestao(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [docs, envios] = await Promise.all([
      prisma.autorizacaoDocumento.findMany({
        select: { id: true, titulo: true, descricao: true, arquivoNome: true, encerrado: true, createdAt: true, publicadoPorNome: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.autorizacaoEnvio.findMany({ select: { documentoId: true, status: true } }),
    ]);
    const conta = (id: string, status: string) => envios.filter((e) => e.documentoId === id && e.status === status).length;
    res.json(docs.map((d) => ({ ...d, aguardando: conta(d.id, 'AGUARDANDO'), validados: conta(d.id, 'VALIDADO') })));
  } catch (err) { next(err); }
}

/** Painel de um documento: quem precisa assinar, em que estado cada um está, e o histórico. */
export async function painel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await prisma.autorizacaoDocumento.findUnique({
      where: { id: String(req.params.docId) },
      select: { id: true, titulo: true, descricao: true, arquivoNome: true, encerrado: true, createdAt: true, publicadoPorNome: true },
    });
    if (!doc) { res.status(404).json({ error: 'Documento não encontrado' }); return; }

    const [usuarios, envios, eventos] = await Promise.all([
      prisma.user.findMany({ where: { isActive: true, role: { not: 'ADMIN' } }, select: { id: true, name: true, email: true, modules: true } }),
      prisma.autorizacaoEnvio.findMany({ where: { documentoId: doc.id }, select: camposEnvio, orderBy: { createdAt: 'desc' } }),
      prisma.autorizacaoEvento.findMany({
        where: { documentoId: doc.id },
        select: { id: true, tipo: true, envioId: true, atorId: true, atorNome: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Deve assinar: quem está ativo com o módulo marcado. Quem já enviou continua
    // na lista mesmo que tenha perdido o módulo ou a conta (vale o snapshot).
    const pessoas = new Map<string, { nome: string; email: string }>();
    for (const u of usuarios) if (parseModules(u.modules).includes(MODULO_AUTORIZACAO)) pessoas.set(u.id, { nome: u.name, email: u.email });
    for (const e of envios) if (e.usuarioId && !pessoas.has(e.usuarioId)) pessoas.set(e.usuarioId, { nome: e.usuarioNome, email: e.usuarioEmail });

    const colaboradores = [...pessoas].map(([usuarioId, p]) => {
      const envio = envios.find((e) => e.usuarioId === usuarioId) ?? null; // o mais recente
      const downloads = eventos.filter((ev) => ev.atorId === usuarioId && ev.tipo === 'BAIXOU_MODELO');
      const baixouEm = downloads.length ? downloads[downloads.length - 1].createdAt : null; // o primeiro
      return { usuarioId, nome: p.nome, email: p.email, baixouEm, envio, estado: estadoDe(baixouEm, envio) };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    res.json({ documento: doc, colaboradores, eventos: eventos.slice(0, 300) });
  } catch (err) { next(err); }
}

export async function encerrar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { encerrado } = z.object({ encerrado: z.boolean() }).parse(req.body);
    const id = String(req.params.docId);
    const existe = await prisma.autorizacaoDocumento.findUnique({ where: { id }, select: { id: true } });
    if (!existe) { res.status(404).json({ error: 'Documento não encontrado' }); return; }
    const doc = await prisma.autorizacaoDocumento.update({ where: { id }, data: { encerrado }, select: { id: true, encerrado: true } });
    res.json(doc);
  } catch (err) { next(err); }
}

/** Valida ou recusa um envio que está AGUARDANDO. A troca é condicional: dois cliques não conferem duas vezes. */
async function conferir(req: Request, res: Response, status: 'VALIDADO' | 'RECUSADO', motivo: string | null): Promise<void> {
  const id = String(req.params.id);
  const envio = await prisma.autorizacaoEnvio.findUnique({ where: { id }, select: { documentoId: true } });
  if (!envio) { res.status(404).json({ error: 'Envio não encontrado' }); return; }
  const { count } = await prisma.autorizacaoEnvio.updateMany({
    where: { id, status: 'AGUARDANDO' },
    data: { status, conferidoPorNome: req.user!.name, conferidoEm: new Date(), motivoRecusa: motivo },
  });
  if (count === 0) { res.status(409).json({ error: 'Este envio já foi conferido.' }); return; }
  await registrar(req, envio.documentoId, status === 'VALIDADO' ? 'VALIDOU' : 'RECUSOU', id);
  res.json(await prisma.autorizacaoEnvio.findUnique({ where: { id }, select: camposEnvio }));
}

export async function validar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try { await conferir(req, res, 'VALIDADO', null); } catch (err) { next(err); }
}

export async function recusar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { motivo } = z.object({ motivo: z.string().trim().min(3).max(500) }).parse(req.body ?? {});
    await conferir(req, res, 'RECUSADO', motivo);
  } catch (err) { next(err); }
}
