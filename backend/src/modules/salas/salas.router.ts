import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { listSalas, agendaDoDia, minhasReservas, reservar, alterar, cancelar } from './salas.controller.js';

const router = Router();

// Decisão de 06/11/2026: todo usuário logado vê a agenda e reserva. Alterar e
// cancelar: o dono só a própria (USER ou GESTOR), ADMIN qualquer — no controller.
router.use(authenticate);

router.get('/', listSalas);
router.get('/reservas', agendaDoDia);
router.get('/reservas/minhas', minhasReservas);
router.post('/reservas', reservar);
router.put('/reservas/:id', alterar);
router.post('/reservas/:id/cancelar', cancelar);

export default router;
