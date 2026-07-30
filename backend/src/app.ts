import express from 'express';
import cors from 'cors';
import authRouter from './modules/auth/auth.router.js';
import usersRouter from './modules/users/users.router.js';
import ticketsRouter from './modules/tickets/tickets.router.js';
import reportsRouter from './modules/reports/reports.router.js';
import suprimesRouter from './modules/suprimentos/suprimentos.router.js';
import filesRouter from './modules/files/files.router.js';
import filesDavRouter from './modules/files/files.dav.js';
import whatsappRouter from './modules/whatsapp/whatsapp.router.js';
import agentRouter from './modules/agent/agent.router.js';
import botRouter from './modules/bot/bot.router.js';
import botBridgeRouter from './modules/bot-bridge/botBridge.router.js';
import maintenancesRouter from './modules/maintenances/maintenances.router.js';
import remindersRouter from './modules/reminders/reminders.router.js';
import backupRouter from './modules/backup/backup.router.js';
import holeritesRouter from './modules/holerites/holerites.router.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { env } from './config/env.js';

const app = express();

// Atrás do Traefik/Coolify: confia no primeiro proxy para que req.ip reflita o
// IP real do cliente (X-Forwarded-For), essencial para o rate-limit por IP.
app.set('trust proxy', 1);

// WebDAV do Office (Word/Excel/PowerPoint abrindo arquivos do repositório). Fica
// ANTES do cors (que responderia todo OPTIONS como preflight, sem os cabeçalhos
// DAV) e do express.json (o PUT do Office é binário). Autentica pelo token do path.
app.use('/api/dav', filesDavRouter);
// O Office sonda a raiz do servidor com OPTIONS antes de abrir o arquivo.
app.options('/', (_req, res) => {
  res.setHeader('DAV', '1,2');
  res.setHeader('MS-Author-Via', 'DAV');
  res.setHeader('Allow', 'OPTIONS, GET, HEAD, PUT, PROPFIND, PROPPATCH, LOCK, UNLOCK');
  res.status(200).end();
});

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
// `verify` guarda o corpo cru: a validação da assinatura do webhook da Meta
// (X-Hub-Signature-256) é um HMAC sobre os bytes originais — reserializar o JSON
// já parseado mudaria o hash.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

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
app.use('/api/bot-bridge', botBridgeRouter);
app.use('/api/maintenances', maintenancesRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/backup', backupRouter);
app.use('/api/holerites', holeritesRouter);

app.use(errorHandler);

export default app;
