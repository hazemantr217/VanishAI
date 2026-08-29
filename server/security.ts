import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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

export const apiRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: Math.max(5, Number.parseInt(process.env.API_RATE_LIMIT_MAX || '40', 10) || 40),
  skip: (request) => request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'طلبات كثيرة جدًا من هذا الجهاز. انتظر قليلًا ثم أعد المحاولة.',
    code: 'RATE_LIMITED',
  },
});

export function enforceSameOrigin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.header('origin');
  if (!origin) {
    if (process.env.NODE_ENV === 'production' && req.header('sec-fetch-site') !== 'same-origin') {
      res.status(403).json({
        error: 'يلزم إرسال الطلب من واجهة التطبيق نفسها.',
        code: 'MISSING_REQUEST_ORIGIN',
      });
      return;
    }
    next();
    return;
  }

  try {
    const expectedHost = req.get('host');
    const originHost = new URL(origin).host;
    if (!expectedHost || originHost !== expectedHost) {
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

  next();
}
