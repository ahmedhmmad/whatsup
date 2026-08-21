import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './env';
import { errorHandler, notFoundHandler } from './errors';
import { logger } from './logger';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { campaignsRouter } from './routes/campaigns';
import { contactsRouter } from './routes/contacts';
import { groupsRouter } from './routes/groups';
import { healthRouter } from './routes/health';
import { importsRouter } from './routes/imports';
import { instanceRouter } from './routes/instance';
import { opsRouter } from './routes/ops';
import { orgRouter } from './routes/org';
import { templatesRouter } from './routes/templates';
import { uploadsRouter } from './routes/uploads';
import { webhooksRouter } from './routes/webhooks';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  app.use(healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/groups', groupsRouter);
  app.use('/api/v1/contacts', contactsRouter);
  app.use('/api/v1/import', importsRouter);
  app.use('/api/v1/instance', instanceRouter);
  app.use('/api/v1/campaigns', campaignsRouter);
  app.use('/api/v1/templates', templatesRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use('/api/v1/ops', opsRouter);
  app.use('/api/v1/webhooks', webhooksRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
