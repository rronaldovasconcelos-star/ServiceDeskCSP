import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { list, create, update, setStatus, runNow, remove } from './reminders.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('lembretes')); // ADMIN ou quem tiver o módulo liberado

router.get('/', list);
router.post('/', create);
router.put('/:id', update);
router.patch('/:id/status', setStatus);
router.post('/:id/run-now', runNow);
router.delete('/:id', remove);

export default router;
