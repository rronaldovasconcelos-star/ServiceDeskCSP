import { Router } from 'express';
import { login, googleLogin, setGooglePhone, getMe, register, changePassword } from './auth.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { rateLimit } from '../../middlewares/rateLimit.js';

const router = Router();

// Anti brute force: limita tentativas por IP nos endpoints públicos (login,
// Google, cadastro) contra varredura automatizada. Desde 06/11/2026 não há OTP:
// o cadastro é aprovado pelo ADMIN e a senha é redefinida por ele em Usuários.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutos
  max: 20,
  message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
});

router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.post('/google/phone', authLimiter, setGooglePhone);
router.post('/register', authLimiter, register);
router.get('/me', authenticate, getMe);
router.post('/change-password', authLimiter, authenticate, changePassword);

export default router;
