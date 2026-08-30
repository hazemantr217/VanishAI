import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { createClient } from 'redis';
import { serverConfig } from './config';

export const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'", 'https://aistudio.google.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'", 'blob:'],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

export async function createApiRateLimiter() {
  const store = serverConfig.redisUrl ? await createRedisRateLimitStore(serverConfig.redisUrl) : undefined;
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 40,
    skip: (request) => request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store,
    message: {
      error: 'طلبات كثيرة جدًا من هذا الجهاز. انتظر قليلًا ثم أعد المحاولة.',
      code: 'RATE_LIMITED',
    },
  });
}

async function createRedisRateLimitStore(redisUrl: string): Promise<RedisStore> {
  const client = createClient({ url: redisUrl });
  client.on('error', (error) => {
    console.error('Shared rate-limit store error:', error instanceof Error ? error.message : 'Redis error');
  });
  await client.connect();
  return new RedisStore({
    prefix: 'vanishai:rate-limit:',
    sendCommand: (...args: string[]) => client.sendCommand(args) as Promise<RedisReply>,
  });
}

export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const fetchSite = req.header('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    res.status(403).json({
      error: 'تم رفض طلب من مصدر خارجي.',
      code: 'CROSS_SITE_REQUEST',
    });
    return;
  }

  const origin = req.header('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const forwardedHosts = (req.header('x-forwarded-host') || '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);
      const expectedHosts = new Set([req.get('host'), req.hostname, ...forwardedHosts].filter(Boolean));
      if (originHost && !expectedHosts.has(originHost)) {
        res.status(403).json({
          error: 'تم رفض طلب من مصدر مختلف.',
          code: 'CROSS_ORIGIN_REQUEST',
        });
        return;
      }
    } catch {
      res.status(403).json({
        error: 'قيمة Origin غير صالحة.',
        code: 'INVALID_ORIGIN',
      });
      return;
    }
  }

  // The AI Studio preview proxy uses JSON without the custom marker. It is
  // allowed only after the browser source and Origin checks above have passed.
  if (req.is('application/json')) {
    next();
    return;
  }

  if (req.header('x-vanish-request') !== '1') {
    res.status(403).json({
      error: 'تحقق الطلب الأمني مفقود.',
      code: 'REQUEST_MARKER_REQUIRED',
    });
    return;
  }

  next();
}
