import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { apiRouter } from './server/api-router';
import { serverConfig } from './server/config';
import { apiMiddlewareErrorHandler } from './server/http-error-handler';
import { createApiRateLimiter, enforceSameOrigin, securityHeaders } from './server/security';

export async function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(securityHeaders);

  app.use('/api', await createApiRateLimiter());
  app.use('/api', enforceSameOrigin);
  app.use('/api', express.json({ limit: serverConfig.requestBodyLimit, strict: true }));
  app.use('/api', apiRouter);
  app.use('/api', apiMiddlewareErrorHandler);

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  return app.listen(serverConfig.port, '0.0.0.0', () => {
    console.log(`VanishAI server listening on port ${serverConfig.port}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error('Failed to start VanishAI server', error);
    process.exitCode = 1;
  });
}
