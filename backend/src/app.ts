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
import maintenancesRouter from './modules/maintenances/maintenances.router.js';
import remindersRouter from './modules/reminders/reminders.router.js';
import backupRouter from './modules/backup/backup.router.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { env } from './config/env.js';

const app = express();

// Atrás do Traefik/Coolify: confia no primeiro proxy para que req.ip reflita o
// IP real do cliente (X-Forwarded-For), essencial para o rate-limit por IP.
app.set('trust proxy', 1);

// CORS: em produção restringe à allowlist (CORS_ALLOWED_ORIGINS); em dev libera
// qualquer origem (localhost:5173 etc.). Requisições sem Origin (curl, health
// check, apps nativos) são sempre permitidas.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.nodeEnv !== 'production' || env.corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origem não permitida pelo CORS'));
      }
    },
    credentials: true,
  }),
);
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
app.use('/api/maintenances', maintenancesRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/backup', backupRouter);

app.use(errorHandler);

export default app;
