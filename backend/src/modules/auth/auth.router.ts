import { Router } from 'express';
import { login, getMe, register, verifyOtp, resendOtp, requestPasswordReset, resetPassword } from './auth.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/me', authenticate, getMe);

export default router;
