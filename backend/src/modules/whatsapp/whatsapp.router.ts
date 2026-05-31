import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { getStatus, getQrCode, disconnectInstance, restartInstance } from './whatsapp.controller.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/status', getStatus);
router.get('/qrcode', getQrCode);
router.post('/disconnect', disconnectInstance);
router.post('/restart', restartInstance);

export default router;
