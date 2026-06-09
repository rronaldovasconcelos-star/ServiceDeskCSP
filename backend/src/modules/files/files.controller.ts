import { Request, Response, NextFunction } from 'express';
import { ZipArchive } from 'archiver';
import { prisma } from '../../lib/prisma.js';
import { storage } from '../../services/storage/index.js';
import {
  buildStorageKey,
  buildZipEntryPath,
  isValidAno,
  isValidSegmento,
  isValidSerie,
  isValidEtapa,
  isValidDisciplina,
  isValidTipo,
} from './taxonomy.js';

const MAX_ZIP_FILES = 300;

// ─── Select helper ────────────────────────────────────────────────────────────

const fileSelect = {
  id: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  sizeBytes: true,
  folder: true,
  anoLetivo: true,
  segmento: true,
  serie: true,
  etapa: true,
  disciplina: true,
  tipoMaterial: true,
  uploadedAt: true,
  ownerId: true,
  owner: { select: { id: true, name: true, email: true } },
};

// ─── Listagem ──────────────────────────────────────────────────────────────────
// Professor (USER) vê só os seus; ADMIN vê todos e pode filtrar por ?ownerId.
// Filtros: ?q (nome), ?type (mimetype), ?folder (categoria).

export async function listFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const role = req.user!.role;
    const isPrivileged = role === 'ADMIN' || role === 'GESTOR';
    const {
      q, type, ownerId, folder,
      anoLetivo, segmento, serie, etapa, disciplina, tipoMaterial,
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (!isPrivileged) {
      where.ownerId = req.user!.sub;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }
    if (q) where.originalName = { contains: q };
    if (type) where.mimeType = { contains: type };
    if (folder) where.folder = folder;
    if (anoLetivo) where.anoLetivo = anoLetivo;
    if (segmento) where.segmento = segmento;
    if (serie) where.serie = serie;
    if (etapa) where.etapa = etapa;
    if (disciplina) where.disciplina = disciplina;
    if (tipoMaterial) where.tipoMaterial = tipoMaterial;

    const files = await (prisma as any).file.findMany({
      where,
      select: fileSelect,
      orderBy: { uploadedAt: 'desc' },
    });
    res.json(files);
  } catch (err) {
    next(err);
  }
}

// ─── Upload (multipart, campo "files", 1..n) ─────────────────────────────────────

export async function uploadFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: 'Nenhum arquivo válido enviado (tipo ou tamanho inválido).' });
      return;
    }

    const ownerId = req.user!.sub;

    // ─── Eixos de classificação (todos obrigatórios) ─────────────────────────
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const axes = {
      anoLetivo: str(req.body.anoLetivo),
      segmento: str(req.body.segmento),
      serie: str(req.body.serie),
      etapa: str(req.body.etapa),
      disciplina: str(req.body.disciplina),
      tipoMaterial: str(req.body.tipoMaterial),
    };

    const invalid =
      !isValidAno(axes.anoLetivo) ? 'Ano letivo inválido' :
      !isValidSegmento(axes.segmento) ? 'Segmento inválido' :
      !isValidSerie(axes.segmento, axes.serie) ? 'Série inválida para o segmento' :
      !isValidEtapa(axes.etapa) ? 'Etapa inválida' :
      !isValidDisciplina(axes.disciplina) ? 'Disciplina inválida' :
      !isValidTipo(axes.tipoMaterial) ? 'Tipo de material inválido' :
      null;
    if (invalid) {
      res.status(400).json({ error: `Classificação obrigatória: ${invalid}.` });
      return;
    }

    const created = [];
    for (const f of files) {
      const key = buildStorageKey(axes, f.filename);
      // save retorna a chave efetiva: path local (disco) ou ID do Drive
      const storageKey = await storage.save(key, f.path, f.mimetype);
      const record = await (prisma as any).file.create({
        data: {
          originalName: f.originalname,
          storedName: f.filename,
          mimeType: f.mimetype,
          sizeBytes: f.size,
          storageKey,
          ownerId,
          ...axes,
        },
        select: fileSelect,
      });
      created.push(record);
    }

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

// ─── Download (stream com checagem dono/admin) ───────────────────────────────────

export async function downloadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await (prisma as any).file.findUnique({ where: { id: req.params.id as string } });
    if (!file) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }
    const canDownload = req.user!.role === 'ADMIN' || req.user!.role === 'GESTOR' || file.ownerId === req.user!.sub;
    if (!canDownload) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (!(await storage.exists(file.storageKey))) {
      res.status(410).json({ error: 'Arquivo ausente no armazenamento' });
      return;
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.sizeBytes));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    );

    const stream = storage.createReadStream(file.storageKey);
    stream.on('error', next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// ─── Download em lote (.zip espelhando a árvore acadêmica) ───────────────────────

export async function downloadZip(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'Nenhum arquivo selecionado.' });
      return;
    }
    if (ids.length > MAX_ZIP_FILES) {
      res.status(400).json({ error: `Máximo de ${MAX_ZIP_FILES} arquivos por download em lote.` });
      return;
    }

    const role = req.user!.role;
    const isPrivileged = role === 'ADMIN' || role === 'GESTOR';
    const files = await (prisma as any).file.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, originalName: true, storageKey: true, ownerId: true,
        anoLetivo: true, segmento: true, serie: true, etapa: true, disciplina: true, tipoMaterial: true,
      },
    });

    // Mantém apenas os que o usuário pode baixar (dono ou privilegiado).
    const allowed = files.filter((f: any) => isPrivileged || f.ownerId === req.user!.sub);
    if (allowed.length === 0) {
      res.status(403).json({ error: 'Nenhum arquivo disponível para download.' });
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="arquivos-csp-${stamp}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', (err: Error) => {
      console.error('[files] erro ao gerar zip:', err);
      res.destroy(err);
    });
    archive.pipe(res);

    // Dedupe de caminhos repetidos: insere " (2)", " (3)"… antes da extensão.
    const used = new Set<string>();
    const uniquePath = (path: string): string => {
      if (!used.has(path)) { used.add(path); return path; }
      const dot = path.lastIndexOf('.');
      const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
      const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
      let n = 2;
      let candidate = `${base} (${n})${ext}`;
      while (used.has(candidate)) { n += 1; candidate = `${base} (${n})${ext}`; }
      used.add(candidate);
      return candidate;
    };

    for (const f of allowed) {
      const entryPath = uniquePath(buildZipEntryPath(f));
      archive.append(storage.createReadStream(f.storageKey), { name: entryPath });
    }

    await archive.finalize();
  } catch (err) {
    next(err);
  }
}

// ─── Exclusão (disco primeiro, depois DB) ────────────────────────────────────────

export async function deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = await (prisma as any).file.findUnique({ where: { id: req.params.id as string } });
    if (!file) {
      res.status(404).json({ error: 'Arquivo não encontrado' });
      return;
    }
    if (req.user!.role !== 'ADMIN' && file.ownerId !== req.user!.sub) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    await storage.delete(file.storageKey);
    await (prisma as any).file.delete({ where: { id: file.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ─── Métricas (ADMIN) ────────────────────────────────────────────────────────────

export async function fileMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const agg = await (prisma as any).file.aggregate({
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });

    const byUserRaw = await (prisma as any).file.groupBy({
      by: ['ownerId'],
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });

    const users = await prisma.user.findMany({
      where: { id: { in: byUserRaw.map((u: any) => u.ownerId) } },
      select: { id: true, name: true, email: true },
    });

    const byUser = byUserRaw
      .map((u: any) => {
        const user = users.find((x) => x.id === u.ownerId);
        return {
          ownerId: u.ownerId,
          name: user?.name ?? '—',
          email: user?.email ?? '',
          fileCount: u._count._all,
          totalBytes: u._sum.sizeBytes ?? 0,
        };
      })
      .sort((a: any, b: any) => b.totalBytes - a.totalBytes);

    res.json({
      totalFiles: agg._count._all,
      totalBytes: agg._sum.sizeBytes ?? 0,
      byUser,
    });
  } catch (err) {
    next(err);
  }
}
