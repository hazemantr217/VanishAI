import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { createClient } from 'redis';
import { serverConfig } from './config';

const AI_STUDIO_PREVIEW_SUFFIX = '.scf.usercontent.goog';
const AI_STUDIO_CLOUD_RUN_HOST = /^ais-(?:dev|pre)-[a-z0-9-]+-\d+\.[a-z0-9-]+\.run\.app$/;
const AI_STUDIO_ORIGINS = new Set([
  'https://aistudio.google.com',
  'https://ai.studio',
]);

export function isGoogleAIStudioPreviewOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
    if (AI_STUDIO_ORIGINS.has(url.origin)) return true;
    return (
      url.hostname.length > AI_STUDIO_PREVIEW_SUFFIX.length &&
      url.hostname.endsWith(AI_STUDIO_PREVIEW_SUFFIX)
    ) || AI_STUDIO_CLOUD_RUN_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export const securityHeaders = helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://ai.studio'],
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

export function enforceSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.header('origin');
  const isAIStudioPreview = isGoogleAIStudioPreviewOrigin(origin);
  const fetchSite = req.header('sec-fetch-site');
  if (fetchSite === 'cross-site' && !isAIStudioPreview) {
    res.status(403).json({
      error: 'تم رفض طلب من مصدر خارجي.',
      code: 'CROSS_SITE_REQUEST',
    });
    return;
  }

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const forwardedHosts = (req.header('x-forwarded-host') || '')
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean);
      const expectedHosts = new Set([req.get('host'), req.hostname, ...forwardedHosts].filter(Boolean));
      if (originHost && !expectedHosts.has(originHost) && !isAIStudioPreview) {
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

  // AI Studio's preview proxy sends the legacy JSON transport without the
  // custom marker. It is accepted only after the source checks above pass.
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
