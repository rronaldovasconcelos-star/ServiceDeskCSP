import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { listUsers, createUser, updateUser, toggleActive, deleteUser, forcePasswordReset } from './users.controller.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/toggle-active', toggleActive);
router.post('/:id/reset-password', forcePasswordReset);
router.delete('/:id', deleteUser);

export default router;
