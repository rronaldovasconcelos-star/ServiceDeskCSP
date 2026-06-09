import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { listUsers, directoryUsers, createUser, updateUser, toggleActive, deleteUser, forcePasswordReset } from './users.controller.js';

const router = Router();

router.use(authenticate);

// Diretório leve (id + nome) p/ seletores — disponível a qualquer autenticado.
router.get('/directory', directoryUsers);

// Acesso ao módulo "Usuários" (ADMIN sempre; ou quem tiver o módulo liberado).
// Restrições de escalonamento (definir ADMIN / editar módulos) ficam no controller.
router.get('/', requireModule('users'), listUsers);
router.post('/', requireModule('users'), createUser);
router.put('/:id', requireModule('users'), updateUser);
router.patch('/:id/toggle-active', requireModule('users'), toggleActive);
router.post('/:id/reset-password', requireModule('users'), forcePasswordReset);
router.delete('/:id', requireModule('users'), deleteUser);

export default router;
