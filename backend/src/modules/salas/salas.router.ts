import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import {
  listSalas, agendaDoDia, proximasReservas, minhasReservas, reservar, alterar, cancelar,
  reservarSerie, excluir, excluirSerie,
} from './salas.controller.js';

const router = Router();

// Decisão de 06/11/2026: todo usuário logado vê a agenda e reserva. Alterar e
// cancelar: o dono só a própria (USER ou GESTOR), ADMIN qualquer — no controller.
// Decisão de 23/11/2026: reserva recorrente e exclusão definitiva (uma reserva ou
// a série inteira) são só do ADMIN; para USER e GESTOR nada muda.
router.use(authenticate);
const soAdmin = requireRole('ADMIN');

router.get('/', listSalas);
router.get('/reservas', agendaDoDia);
router.get('/reservas/proximas', proximasReservas);
router.get('/reservas/minhas', minhasReservas);
router.post('/reservas', reservar);
router.post('/reservas/recorrente', soAdmin, reservarSerie);
router.put('/reservas/:id', alterar);
router.post('/reservas/:id/cancelar', cancelar);
router.delete('/reservas/:id', soAdmin, excluir);
router.delete('/series/:serieId', soAdmin, excluirSerie);

export default router;
