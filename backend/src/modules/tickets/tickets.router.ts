import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import {
  listTickets,
  createTicket,
  getTicket,
  changeStatus,
  assignTicket,
  addComment,
} from './tickets.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listTickets);
router.post('/', createTicket);
router.get('/:id', getTicket);
router.patch('/:id/status', changeStatus);
router.patch('/:id/assign', requireRole('ADMIN'), assignTicket);
router.post('/:id/comments', addComment);

export default router;
