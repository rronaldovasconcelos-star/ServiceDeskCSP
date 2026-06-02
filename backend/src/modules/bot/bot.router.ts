import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { makeWhatsappControllers } from '../whatsapp/whatsapp.controller.js';
import { env } from '../../config/env.js';
import { botWebhook } from './bot.controller.js';

const router = Router();

// Webhook público (autenticado pelo segredo na URL). O Evolution pode anexar o
// nome do evento ao path quando "webhook por eventos" está ligado — aceitamos ambos.
router.post('/webhook/:secret', botWebhook);
router.post('/webhook/:secret/:event', botWebhook);

// Gestão de conexão da instância de suporte (csp-suporte) — admin only.
const support = makeWhatsappControllers(env.supportEvolutionInstance);
router.get('/connection/status', authenticate, requireRole('ADMIN'), support.getStatus);
router.get('/connection/qrcode', authenticate, requireRole('ADMIN'), support.getQrCode);
router.post('/connection/disconnect', authenticate, requireRole('ADMIN'), support.disconnectInstance);
router.post('/connection/restart', authenticate, requireRole('ADMIN'), support.restartInstance);

export default router;
