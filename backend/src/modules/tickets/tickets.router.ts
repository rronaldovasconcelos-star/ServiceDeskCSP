import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import {
  listTickets,
  createTicket,
  getTicket,
  changeStatus,
  assignTicket,
  addComment,
  deleteTicket,
  previewBulkDelete,
  bulkDelete,
} from './tickets.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listTickets);
router.post('/', createTicket);

// Rotas administrativas de exclusão — estáticas antes de /:id para o Express
// não capturar "admin" como id. Restritas ao ADMIN.
router.get('/admin/bulk-preview', requireRole('ADMIN'), previewBulkDelete);
router.delete('/admin/bulk', requireRole('ADMIN'), bulkDelete);

router.get('/:id', getTicket);
router.patch('/:id/status', changeStatus);
router.patch('/:id/assign', requireRole('ADMIN'), assignTicket);
router.post('/:id/comments', addComment);
router.delete('/:id', requireRole('ADMIN'), deleteTicket);

export default router;
