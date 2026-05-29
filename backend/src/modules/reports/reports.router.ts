import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import { getMetrics, exportCsv, exportPdf, exportSupplyCsv, exportSupplyPdf } from './reports.controller.js';

const router = Router();

router.use(authenticate, requireRole('ADMIN'));

router.get('/metrics', getMetrics);
router.get('/export/csv', exportCsv);
router.get('/export/pdf', exportPdf);
router.get('/export/suprimentos/csv', exportSupplyCsv);
router.get('/export/suprimentos/pdf', exportSupplyPdf);

export default router;
