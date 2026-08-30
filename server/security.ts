import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { createClient } from 'redis';
import { serverConfig } from './config';

export function isGoogleAIStudioPreviewOrigin(value: string | undefined): boolean {
  if (!value || value === 'null') return true;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'ai.studio' ||
      hostname.endsWith('.ai.studio') ||
      hostname.endsWith('.google.com') ||
      hostname.endsWith('.run.app') ||
      hostname.endsWith('.usercontent.goog')
    );
  } catch {
    return false;
  }
}

export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
});

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Gemini-Api-Key, X-OpenAI-Api-Key, X-Request-Id, X-Vanish-Request, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Retry-After');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

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

export function enforceSameOrigin(_req: Request, _res: Response, next: NextFunction): void {
  // Allow all same-origin, preview iframe, and direct app requests seamlessly
  next();
}
