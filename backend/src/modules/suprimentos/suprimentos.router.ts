import { Router } from 'express';
import { authenticate, requireRole, requireModule } from '../../middlewares/authenticate.js';
import {
  listItems,
  createItem,
  updateItem,
  toggleItemActive,
  deleteItem,
  previewBulkItems,
  bulkDeleteItems,
  listRequests,
  createRequest,
  getRequest,
  changeRequestStatus,
  addComment,
  deleteRequest,
  previewBulkRequests,
  bulkDeleteRequests,
} from './suprimentos.controller.js';

const router = Router();

router.use(authenticate);

// Catalog — rotas /admin/* estáticas antes de /:id (Express). Gestão do catálogo
// liberável pelo módulo "catalogo" (ADMIN sempre). Leitura aberta a todos.
router.get('/items', listItems);
router.post('/items', requireModule('catalogo'), createItem);
router.get('/items/admin/bulk-preview', requireModule('catalogo'), previewBulkItems);
router.delete('/items/admin/bulk', requireModule('catalogo'), bulkDeleteItems);
router.put('/items/:id', requireModule('catalogo'), updateItem);
router.patch('/items/:id/toggle-active', requireModule('catalogo'), toggleItemActive);
router.delete('/items/:id', requireModule('catalogo'), deleteItem);

// Requests — idem.
router.get('/requests', listRequests);
router.post('/requests', createRequest);
router.get('/requests/admin/bulk-preview', requireRole('ADMIN'), previewBulkRequests);
router.delete('/requests/admin/bulk', requireRole('ADMIN'), bulkDeleteRequests);
router.get('/requests/:id', getRequest);
router.patch('/requests/:id/status', requireRole('ADMIN'), changeRequestStatus);
router.post('/requests/:id/comments', addComment);
router.delete('/requests/:id', requireRole('ADMIN'), deleteRequest);

export default router;
