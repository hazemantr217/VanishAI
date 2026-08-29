import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

function numericStatus(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 0;
  const status = Number(error.status);
  return Number.isInteger(status) ? status : 0;
}

function errorType(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('type' in error)) return '';
  return typeof error.type === 'string' ? error.type : '';
}

export const apiMiddlewareErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent || res.writableEnded) {
    next(error);
    return;
  }

  const requestId = (res.locals.requestId as string | undefined) || randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'no-store');

  if (numericStatus(error) === 413 || errorType(error) === 'entity.too.large') {
    res.status(413).json({
      error: 'حجم الطلب أكبر من الحد المسموح.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId,
    });
    return;
  }

  if (error instanceof SyntaxError || errorType(error) === 'entity.parse.failed') {
    res.status(400).json({
      error: 'بيانات JSON غير صالحة.',
      code: 'INVALID_JSON',
      requestId,
    });
    return;
  }

  console.error(`[${requestId}] API middleware failed`, {
    name: error instanceof Error ? error.name : typeof error,
  });
  res.status(500).json({
    error: 'حدث خطأ غير متوقع في الخادم.',
    code: 'INTERNAL_SERVER_ERROR',
    requestId,
  });
};
