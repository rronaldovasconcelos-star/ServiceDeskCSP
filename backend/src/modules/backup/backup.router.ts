import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { list, runNow, download, remove } from './backup.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('backups')); // ADMIN ou quem tiver o módulo liberado

router.get('/', list);
router.post('/run-now', runNow);
router.get('/:id/download', download);
router.delete('/:id', remove);

export default router;
