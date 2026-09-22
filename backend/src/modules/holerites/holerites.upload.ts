import multer from 'multer';
import path from 'node:path';

// O TXT da folha é pequeno (alguns KB por colaborador); 5 MB é folga de sobra.
// Fica em memória: o parser lê o buffer e nada é gravado em disco.
export const uploadTxt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ext === '.txt');
  },
});
