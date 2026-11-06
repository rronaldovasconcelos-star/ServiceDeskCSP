import multer from 'multer';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export type TipoReal = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

/**
 * Descobre o tipo pelo CONTEÚDO (assinatura dos primeiros bytes). Extensão e
 * mimetype vêm do cliente e não provam nada: um .png pode ser qualquer coisa.
 */
export function detectarTipo(buf: Buffer): TipoReal | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/**
 * Upload de UM arquivo em memória (nada vai para o disco), com limite próprio.
 * Estouro do limite responde 413 com o tamanho certo deste envio (o errorHandler
 * global fala sempre no limite do repositório de arquivos). Nomes em UTF-8.
 */
export function uploadEmMemoria(campo: string, maxMb: number): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    defParamCharset: 'utf8',
  }).single(campo);

  return (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: `Arquivo excede o limite de ${maxMb} MB` });
        return;
      }
      next(err);
    });
  };
}
