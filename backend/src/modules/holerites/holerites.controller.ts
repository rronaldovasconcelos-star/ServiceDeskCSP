import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HoleriteParseError } from './holerite.parser.js';
import {
  HoleriteErro,
  importarArquivo,
  listarMeus,
  obterHoleriteAutorizado,
  gerarPdf,
  nomeArquivoPdf,
  listarColaboradores,
  vincularUsuario,
  atualizarDados,
  listarHoleritesDoColaborador,
  listarImportacoes,
  listarUsuariosParaVinculo,
  type Ator,
} from './holerites.service.js';
import {
  isHoleriteDriveConfigured,
  listarArquivosDrive,
  importarDoDrive,
  importarNovosDoDrive,
} from './holerites.drive.js';
import { env } from '../../config/env.js';

function atorDe(req: Request): Ator {
  return { id: req.user?.sub ?? null, nome: req.user?.name ?? 'desconhecido' };
}

/** Converte os erros do módulo em respostas HTTP; o resto segue para o errorHandler. */
function responderErro(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof HoleriteParseError) {
    res.status(400).json({ error: `Arquivo recusado. ${err.message}` });
    return;
  }
  if (err instanceof HoleriteErro) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err);
}

// ---------- colaborador ----------

/** Holerites do usuário logado (via vínculo colaborador ↔ login). */
export async function meus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await listarMeus(req.user!.sub));
  } catch (err) {
    responderErro(err, res, next);
  }
}

/** PDF de um holerite — só o dono, ADMIN ou quem tem o módulo RH. */
export async function pdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const h = await obterHoleriteAutorizado(req.params.id as string, req.user!);
    const bytes = await gerarPdf(h);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivoPdf(h)}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(bytes);
  } catch (err) {
    responderErro(err, res, next);
  }
}

// ---------- RH ----------

/** Upload manual do TXT (campo multipart "arquivo"). */
export async function importar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Envie o arquivo .txt exportado da folha no campo "arquivo".' });
      return;
    }
    const resultado = await importarArquivo(req.file.buffer, {
      arquivo: req.file.originalname,
      origem: 'UPLOAD',
      ator: atorDe(req),
    });
    res.status(201).json(resultado);
  } catch (err) {
    responderErro(err, res, next);
  }
}

/** Estado da pasta do Drive: configurado? quais .txt há, quais já entraram. */
export async function drive(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isHoleriteDriveConfigured()) {
      res.json({ configured: false, pasta: env.holeriteDriveFolder, intervaloMin: 0, arquivos: [] });
      return;
    }
    res.json({
      configured: true,
      pasta: env.holeriteDriveFolder,
      intervaloMin: env.holeriteDriveIntervalMin,
      arquivos: await listarArquivosDrive(),
    });
  } catch (err) {
    responderErro(err, res, next);
  }
}

const driveImportarSchema = z.object({ fileId: z.string().min(1).optional() });

/** Importa um arquivo do Drive (fileId) ou todos os que ainda não entraram. */
export async function driveImportar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isHoleriteDriveConfigured()) {
      res.status(409).json({ error: 'Google Drive não configurado neste ambiente.' });
      return;
    }
    const { fileId } = driveImportarSchema.parse(req.body ?? {});
    const ator = atorDe(req);
    if (fileId) {
      const r = await importarDoDrive(fileId, ator);
      res.status(201).json({ importados: [r], erros: [], ignorados: 0 });
      return;
    }
    res.status(201).json(await importarNovosDoDrive(ator));
  } catch (err) {
    responderErro(err, res, next);
  }
}

export async function colaboradores(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await listarColaboradores());
  } catch (err) {
    responderErro(err, res, next);
  }
}

const vinculoSchema = z.object({ userId: z.string().min(1).nullable() });

export async function vinculo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = vinculoSchema.parse(req.body);
    res.json(await vincularUsuario(req.params.id as string, userId));
  } catch (err) {
    responderErro(err, res, next);
  }
}

const texto = z.string().trim().max(40).nullable().optional();
const dadosSchema = z.object({
  cpf: z.string().trim().regex(/^(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})?$/, 'CPF deve ter 11 dígitos (000.000.000-00)').nullable().optional(),
  ctps: texto,
  admissao: z.string().trim().regex(/^(\d{2}\/\d{2}\/\d{4})?$/, 'Admissão no formato dd/mm/aaaa').nullable().optional(),
  cargoCodigo: texto,
  deptoCodigo: texto,
});

export async function dados(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const d = dadosSchema.parse(req.body);
    // CPF só com dígitos vira 000.000.000-00
    if (d.cpf && /^\d{11}$/.test(d.cpf)) d.cpf = d.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    res.json(await atualizarDados(req.params.id as string, d));
  } catch (err) {
    responderErro(err, res, next);
  }
}

export async function holeritesDoColaborador(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await listarHoleritesDoColaborador(req.params.id as string));
  } catch (err) {
    responderErro(err, res, next);
  }
}

export async function importacoes(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await listarImportacoes());
  } catch (err) {
    responderErro(err, res, next);
  }
}

export async function usuarios(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await listarUsuariosParaVinculo());
  } catch (err) {
    responderErro(err, res, next);
  }
}
