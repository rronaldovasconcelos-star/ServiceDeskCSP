import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import {
  getMetrics, getOverview, getTimeseries, getSla, getProdutividade,
  exportCsv, exportPdf, exportExecutivePdf, exportSupplyCsv, exportSupplyPdf,
} from './reports.controller.js';

const router = Router();

router.use(authenticate, requireModule('relatorios'));

router.get('/metrics', getMetrics);
// Relatórios profissionais (aceitam ?from=&to=)
router.get('/overview', getOverview);
router.get('/timeseries', getTimeseries);
router.get('/sla', getSla);
router.get('/produtividade', getProdutividade);

router.get('/export/csv', exportCsv);
router.get('/export/pdf', exportPdf);
router.get('/export/executivo/pdf', exportExecutivePdf);
router.get('/export/suprimentos/csv', exportSupplyCsv);
router.get('/export/suprimentos/pdf', exportSupplyPdf);

export default router;
