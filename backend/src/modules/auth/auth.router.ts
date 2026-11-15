import { Router } from 'express';
import {
  login, googleLogin, setGooglePhone, getMe, register, changePassword,
  verifyOtp, resendOtp, requestPasswordReset, resetPassword,
} from './auth.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { rateLimit } from '../../middlewares/rateLimit.js';

const router = Router();

// Anti brute force: limita tentativas por IP nos endpoints que validam senha,
// código de verificação ou e-mail. Os fluxos de código já têm throttle próprio
// por usuário (60 s entre envios, 5 tentativas por código); este limite por IP é
// a camada complementar contra varredura automatizada.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutos
  max: 20,
  message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
});

router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);
router.post('/google/phone', authLimiter, setGooglePhone);
router.post('/register', authLimiter, register);
router.post('/verify-otp', authLimiter, verifyOtp);
router.post('/resend-otp', authLimiter, resendOtp);
router.post('/request-password-reset', authLimiter, requestPasswordReset);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/me', authenticate, getMe);
router.post('/change-password', authLimiter, authenticate, changePassword);

export default router;
