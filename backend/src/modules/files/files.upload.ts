import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { LOCAL_ROOT } from '../../services/storage/LocalDiskProvider.js';

// Tipos permitidos — dupla validação (extensão + mimetype) no backend.
const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp4', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp',
]);

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

// Multer grava primeiro na raiz com um nome UUID (o ownerId só é conhecido
// após a autenticação; o controller move depois para {ownerId}/...).
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOCAL_ROOT),
  filename: (_req, file, cb) =>
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

export const upload = multer({
  storage: diskStorage,
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXT.has(ext) && ALLOWED_MIME.has(file.mimetype));
  },
});
