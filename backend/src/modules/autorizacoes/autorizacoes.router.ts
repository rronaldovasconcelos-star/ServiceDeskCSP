import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, requireModule, requireRole } from '../../middlewares/authenticate.js';
import { uploadEmMemoria } from '../../lib/uploadSeguro.js';
import {
  MODULO_AUTORIZACAO, LIMITE_PDF_MB,
  minhas, baixarModelo, enviarAssinado, baixarAssinado,
  publicar, listarGestao, painel, encerrar, validar, recusar,
} from './autorizacoes.controller.js';

const router = Router();
const uploadPdf = uploadEmMemoria('arquivo', LIMITE_PDF_MB);

// Quem assina: quem o admin marcou na tela de Usuários (ADMIN passa sempre).
const colaborador = requireModule(MODULO_AUTORIZACAO);
// Quem publica e confere: "só gestor" do pedido = GESTOR e ADMIN.
const gestao = requireRole('ADMIN', 'GESTOR');
/** Baixar o modelo: colaborador com o módulo OU gestão. */
function colaboradorOuGestao(req: Request, res: Response, next: NextFunction): void {
  const u = req.user!;
  if (u.role === 'ADMIN' || u.role === 'GESTOR' || (u.modules ?? []).includes(MODULO_AUTORIZACAO)) { next(); return; }
  res.status(403).json({ error: 'Acesso negado' });
}

router.use(authenticate);

// Gestão — antes das rotas com `/:docId`. O perfil é conferido ANTES de ler o corpo do envio.
router.get('/gestao', gestao, listarGestao);
router.post('/gestao', gestao, uploadPdf, publicar);
router.get('/gestao/:docId', gestao, painel);
router.post('/gestao/:docId/encerrar', gestao, encerrar);
router.post('/gestao/envios/:id/validar', gestao, validar);
router.post('/gestao/envios/:id/recusar', gestao, recusar);

// Colaborador
router.get('/minhas', colaborador, minhas);
// Sem guarda de módulo aqui: a regra é do controller (só o dono do envio ou a gestão),
// e quem assinou continua podendo baixar o próprio arquivo mesmo se perder o módulo.
router.get('/envios/:id/arquivo', baixarAssinado);
router.get('/:docId/modelo', colaboradorOuGestao, baixarModelo);
router.post('/:docId/envio', colaborador, uploadPdf, enviarAssinado);

export default router;
