import { Router } from 'express';
import multer from 'multer';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import {
  getStatus,
  getConfig,
  updateConfig,
  listFiles,
  uploadFile,
  deleteFile,
  getConnection,
  getConnectionQr,
  disconnect,
  restart,
} from './agent.controller.js';

// Buffer em memória — apenas repassamos o arquivo ao bot (que é a fonte da verdade).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/status', getStatus);
router.get('/config', getConfig);
router.put('/config', updateConfig);
router.get('/files', listFiles);
router.post('/files', upload.single('file'), uploadFile);
router.delete('/files/:id', deleteFile);

router.get('/connection', getConnection);
router.get('/connection/qrcode', getConnectionQr);
router.post('/connection/disconnect', disconnect);
router.post('/connection/restart', restart);

export default router;
