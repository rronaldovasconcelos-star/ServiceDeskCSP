import { Router } from 'express';
import { authenticate, requireRole } from '../../middlewares/authenticate.js';
import {
  listItems,
  createItem,
  updateItem,
  toggleItemActive,
  listRequests,
  createRequest,
  getRequest,
  changeRequestStatus,
  addComment,
} from './suprimentos.controller.js';

const router = Router();

router.use(authenticate);

// Catalog
router.get('/items', listItems);
router.post('/items', requireRole('ADMIN'), createItem);
router.put('/items/:id', requireRole('ADMIN'), updateItem);
router.patch('/items/:id/toggle-active', requireRole('ADMIN'), toggleItemActive);

// Requests
router.get('/requests', listRequests);
router.post('/requests', createRequest);
router.get('/requests/:id', getRequest);
router.patch('/requests/:id/status', requireRole('ADMIN'), changeRequestStatus);
router.post('/requests/:id/comments', addComment);

export default router;
