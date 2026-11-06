import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { listSalas, agendaDoDia, minhasReservas, reservar, cancelar } from './salas.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('agendamento_salas')); // ADMIN ou quem o admin marcou na tela de Usuários

router.get('/', listSalas);
router.get('/reservas', agendaDoDia);
router.get('/reservas/minhas', minhasReservas);
router.post('/reservas', reservar);
router.post('/reservas/:id/cancelar', cancelar);

export default router;
