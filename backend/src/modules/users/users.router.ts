import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { listUsers, createUser, updateUser, toggleActive, deleteUser, forcePasswordReset } from './users.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requireRole('ADMIN', 'GESTOR'), listUsers);
router.post('/', requireRole('ADMIN'), createUser);
router.put('/:id', requireRole('ADMIN'), updateUser);
router.patch('/:id/toggle-active', requireRole('ADMIN'), toggleActive);
router.post('/:id/reset-password', requireRole('ADMIN'), forcePasswordReset);
router.delete('/:id', requireRole('ADMIN'), deleteUser);

export default router;
