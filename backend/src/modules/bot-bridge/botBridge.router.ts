import { Router } from 'express';
import { lookup, register, verifyOtp, openTicket } from './botBridge.controller.js';

// Ponte para o bot de suporte no n8n. Segredo no path (env BOT_BRIDGE_SECRET).
const router = Router();

router.post('/:secret/lookup', lookup);
router.post('/:secret/register', register);
router.post('/:secret/verify-otp', verifyOtp);
router.post('/:secret/open-ticket', openTicket);

export default router;
