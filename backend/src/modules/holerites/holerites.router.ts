import { Router } from 'express';
import { authenticate, requireModule } from '../../middlewares/authenticate.js';
import { uploadTxt } from './holerites.upload.js';
import { MODULO_RH } from './holerites.service.js';
import {
  meus,
  pdf,
  importar,
  drive,
  driveImportar,
  colaboradores,
  vinculo,
  dados,
  holeritesDoColaborador,
  importacoes,
  usuarios,
} from './holerites.controller.js';

const router = Router();
router.use(authenticate);

// --- RH (ADMIN ou módulo "rh" liberado) ---
const rh = Router();
rh.use(requireModule(MODULO_RH));
rh.post('/importar', uploadTxt.single('arquivo'), importar);
rh.get('/drive', drive);
rh.post('/drive/importar', driveImportar);
rh.get('/colaboradores', colaboradores);
rh.put('/colaboradores/:id/vinculo', vinculo);
rh.put('/colaboradores/:id/dados', dados);
rh.get('/colaboradores/:id/holerites', holeritesDoColaborador);
rh.get('/importacoes', importacoes);
rh.get('/usuarios', usuarios);
router.use('/rh', rh);

// --- colaborador (qualquer autenticado; o serviço confere o vínculo) ---
router.get('/meus', meus);
router.get('/:id/pdf', pdf);

export default router;
