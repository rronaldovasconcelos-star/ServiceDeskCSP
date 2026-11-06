import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { detectarTipo } from '../../lib/uploadSeguro.js';

const TIPOS_LOGO = ['image/png', 'image/jpeg', 'image/webp'];

/** Só http/https: o link vira href na tela, e `javascript:`/`data:` executariam no clique. */
function linkSeguro(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Os campos chegam como texto (multipart). Link vazio = sem link.
const baseSchema = z.object({
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().min(1).max(2000),
  link: z.string().trim().max(500).refine((v) => v === '' || linkSeguro(v), 'O link precisa começar com http:// ou https://'),
  ativo: z.enum(['true', 'false']),
  ordem: z.coerce.number().int().min(0).max(9999),
  removerLogo: z.enum(['true', 'false']),
});

const createSchema = baseSchema.partial().required({ nome: true, descricao: true });
const updateSchema = baseSchema.partial();

const campos = {
  id: true, nome: true, descricao: true, link: true, logoMime: true, ativo: true, ordem: true,
  criadoPorNome: true, createdAt: true, updatedAt: true,
} as const;

interface Linha {
  id: string; nome: string; descricao: string; link: string | null; logoMime: string | null;
  ativo: boolean; ordem: number; criadoPorNome: string; createdAt: Date; updatedAt: Date;
}

/** Formato da API: nunca devolve os bytes do logo, só se existe. */
function saida({ logoMime, ...resto }: Linha) {
  return { ...resto, temLogo: Boolean(logoMime) };
}

/** Confere o logo pelo conteúdo. Devolve os dados a gravar, ou a mensagem de erro. */
function lerLogo(file: Express.Multer.File | undefined): { logo: Uint8Array<ArrayBuffer>; logoMime: string } | string | null {
  if (!file) return null;
  const tipo = detectarTipo(file.buffer);
  if (!tipo || !TIPOS_LOGO.includes(tipo)) return 'O logo precisa ser uma imagem PNG, JPG ou WEBP.';
  return { logo: new Uint8Array(file.buffer), logoMime: tipo };
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itens = await prisma.beneficio.findMany({
      where: req.user!.role === 'ADMIN' ? {} : { ativo: true },
      select: campos,
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    });
    res.json(itens.map(saida));
  } catch (err) { next(err); }
}

export async function logo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const b = await prisma.beneficio.findUnique({
      where: { id: String(req.params.id) },
      select: { logo: true, logoMime: true, ativo: true },
    });
    const visivel = b && (b.ativo || req.user!.role === 'ADMIN');
    if (!visivel || !b.logo || !b.logoMime) { res.status(404).json({ error: 'Logo não encontrado' }); return; }
    res.setHeader('Content-Type', b.logoMime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(b.logo));
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSchema.parse(req.body ?? {});
    const img = lerLogo(req.file);
    if (typeof img === 'string') { res.status(400).json({ error: img }); return; }

    const item = await prisma.beneficio.create({
      data: {
        nome: data.nome,
        descricao: data.descricao,
        link: data.link || null,
        ativo: data.ativo !== 'false',
        ordem: data.ordem ?? 0,
        ...(img ?? {}),
        criadoPorId: req.user!.sub,
        criadoPorNome: req.user!.name,
      },
      select: campos,
    });
    res.status(201).json(saida(item));
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const data = updateSchema.parse(req.body ?? {});
    const img = lerLogo(req.file);
    if (typeof img === 'string') { res.status(400).json({ error: img }); return; }

    const existe = await prisma.beneficio.findUnique({ where: { id }, select: { id: true } });
    if (!existe) { res.status(404).json({ error: 'Benefício não encontrado' }); return; }

    const item = await prisma.beneficio.update({
      where: { id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.link !== undefined ? { link: data.link || null } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo === 'true' } : {}),
        ...(data.ordem !== undefined ? { ordem: data.ordem } : {}),
        ...(img ?? (data.removerLogo === 'true' ? { logo: null, logoMime: null } : {})),
      },
      select: campos,
    });
    res.json(saida(item));
  } catch (err) { next(err); }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const existe = await prisma.beneficio.findUnique({ where: { id }, select: { id: true } });
    if (!existe) { res.status(404).json({ error: 'Benefício não encontrado' }); return; }
    await prisma.beneficio.delete({ where: { id } });
    res.status(204).send();
  } catch (err) { next(err); }
}
