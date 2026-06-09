import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { upload } from './files.upload.js';
import {
  listFiles,
  uploadFiles,
  downloadFile,
  downloadZip,
  deleteFile,
  fileMetrics,
} from './files.controller.js';

const router = Router();

router.use(authenticate);

router.get('/metrics', requireModule('repositorio'), fileMetrics); // antes das rotas com :id
router.get('/', listFiles);
router.post('/', upload.array('files', 20), uploadFiles);
router.post('/download-zip', downloadZip); // antes das rotas com :id
router.get('/:id/download', downloadFile);
router.delete('/:id', deleteFile);

export default router;
