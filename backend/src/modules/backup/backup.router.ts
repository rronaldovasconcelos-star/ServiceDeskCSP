import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { list, runNow, download, remove } from './backup.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN')); // módulo inteiro restrito ao ADMIN

router.get('/', list);
router.post('/run-now', runNow);
router.get('/:id/download', download);
router.delete('/:id', remove);

export default router;
