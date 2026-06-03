import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { list, get, create, update, setStatus, runNow, remove } from './maintenances.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN')); // módulo inteiro restrito ao ADMIN

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.put('/:id', update);
router.patch('/:id/status', setStatus);
router.post('/:id/run-now', runNow);
router.delete('/:id', remove);

export default router;
