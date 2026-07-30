import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { makeWhatsappControllers } from '../whatsapp/whatsapp.controller.js';
import { env } from '../../config/env.js';
import { botWebhook } from './bot.controller.js';
import { cloudWebhook, cloudWebhookVerify } from './bot.cloudWebhook.js';

const router = Router();

// Webhook da Cloud API (Meta). Declarado ANTES do webhook do Evolution: a rota
// `/webhook/:secret/:event` casaria com `/webhook/<secret>/cloud` e roubaria o POST.
// O GET é o handshake de verificação da Meta (hub.challenge).
router.get('/webhook/cloud/:secret', cloudWebhookVerify);
router.post('/webhook/cloud/:secret', cloudWebhook);

// Webhook público (autenticado pelo segredo na URL). O Evolution pode anexar o
// nome do evento ao path quando "webhook por eventos" está ligado — aceitamos ambos.
router.post('/webhook/:secret', botWebhook);
router.post('/webhook/:secret/:event', botWebhook);

// Gestão de conexão da instância de suporte (csp-suporte) — ADMIN ou módulo "bot".
const support = makeWhatsappControllers(env.supportEvolutionInstance);
router.get('/connection/status', authenticate, requireModule('bot'), support.getStatus);
router.get('/connection/qrcode', authenticate, requireModule('bot'), support.getQrCode);
router.post('/connection/disconnect', authenticate, requireModule('bot'), support.disconnectInstance);
router.post('/connection/restart', authenticate, requireModule('bot'), support.restartInstance);

export default router;
