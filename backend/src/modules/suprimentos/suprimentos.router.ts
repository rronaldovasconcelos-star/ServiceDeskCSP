import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
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

// Catalog — rotas /admin/* estáticas antes de /:id (Express). Exclusão restrita ao ADMIN.
router.get('/items', listItems);
router.post('/items', requireRole('ADMIN'), createItem);
router.get('/items/admin/bulk-preview', requireRole('ADMIN'), previewBulkItems);
router.delete('/items/admin/bulk', requireRole('ADMIN'), bulkDeleteItems);
router.put('/items/:id', requireRole('ADMIN'), updateItem);
router.patch('/items/:id/toggle-active', requireRole('ADMIN'), toggleItemActive);
router.delete('/items/:id', requireRole('ADMIN'), deleteItem);

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
