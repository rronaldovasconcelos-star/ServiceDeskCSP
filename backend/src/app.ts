import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import ticketsRouter from './modules/tickets/tickets.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import suprimesRouter from './modules/suprimentos/suprimentos.router.js';
import filesRouter from './modules/files/files.router.js';
import whatsappRouter from './modules/whatsapp/whatsapp.router.js';
import agentRouter from './modules/agent/agent.router.js';
import botRouter from './modules/bot/bot.router.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/suprimentos', suprimesRouter);
app.use('/api/files', filesRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/agent', agentRouter);
app.use('/api/bot', botRouter);

app.use(errorHandler);

export default app;
