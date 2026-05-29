import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import ticketsRouter from './modules/tickets/tickets.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/reports', reportsRouter);

app.use(errorHandler);

export default app;
