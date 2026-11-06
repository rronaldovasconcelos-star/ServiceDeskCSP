import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { uploadEmMemoria } from '../../lib/uploadSeguro.js';
import { list, logo, create, update, remove } from './beneficios.controller.js';

const router = Router();
const uploadLogo = uploadEmMemoria('logo', 1);

router.use(authenticate);

// Leitura: todo usuário autenticado (só os ativos; ADMIN vê também os ocultos).
router.get('/', list);
router.get('/:id/logo', logo);

// Cadastro: só ADMIN. O perfil é conferido ANTES de ler o corpo do envio.
router.post('/', requireRole('ADMIN'), uploadLogo, create);
router.put('/:id', requireRole('ADMIN'), uploadLogo, update);
router.delete('/:id', requireRole('ADMIN'), remove);

export default router;
