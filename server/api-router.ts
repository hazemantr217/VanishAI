import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { serverConfig, isGoogleManagedRuntime, isOpenAIEnabled, resolveGeminiApiKey, resolveOpenAIApiKey } from './config';
import { ApiError, isAbortError, isAccessDeniedError, isAuthenticationError, isQuotaError, publicErrorMessage } from './errors';
import { createRequestAbortController } from './request-abort';
import { inpaintRequestSchema, mergeBatchRequestSchema } from './validation';
import {
  editWithGemini,
  mergeWithGemini,
  verifyGeminiKey,
  type GeminiRequestContext,
} from './providers/gemini';
import { editWithOpenAI } from './providers/openai';
import { inpaintBody, inpaintUploadMiddleware, mergeBody, mergeUploadMiddleware } from './multipart';
import { isGeminiModel, isOpenAIModel } from '../src/shared/models';

export const apiRouter = express.Router();

export function geminiRequestContext(req: Request): GeminiRequestContext {
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const candidates = [
    req.header('referer'),
    req.header('origin'),
    forwardedHost ? `https://${forwardedHost}/` : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate || candidate.length > 2_048 || /[\r\n]/.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      url.search = '';
      url.hash = '';
      return { referrer: url.toString() };
    } catch {
      // Try the next trusted request-derived candidate.
    }
  }

  return {};
}

apiRouter.use((_req, res, next) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('Cache-Control', 'no-store');
  next();
});

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

apiRouter.get('/runtime-config', (_req, res) => {
  res.json({
    geminiCredentialMode: serverConfig.managedGeminiApiKey ? 'managed' : 'byok',
    googleOnlyMode: isGoogleManagedRuntime(),
    openaiAvailable: isOpenAIEnabled(),
    maxBatchConcurrency: serverConfig.maxBatchConcurrency,
  });
});

apiRouter.post('/credentials/verify', async (req, res, next) => {
  const apiKey = resolveGeminiApiKey(req);
  if (!apiKey) {
    next(new ApiError(401, 'أدخل مفتاح Gemini API للمتابعة.', 'API_KEY_REQUIRED'));
    return;
  }

  const requestAbort = createRequestAbortController(req, res);
  try {
    await verifyGeminiKey(apiKey, requestAbort.signal, geminiRequestContext(req));
    if (!res.writableEnded) res.json({ valid: true });
  } catch (error) {
    next(error);
  } finally {
    requestAbort.cleanup();
  }
});

apiRouter.post('/inpaint', inpaintUploadMiddleware, async (req, res, next) => {
  const requestAbort = createRequestAbortController(req, res);
  try {
    const input = inpaintRequestSchema.parse(inpaintBody(req));
    let resultImage: string;

    if (isGeminiModel(input.model)) {
      const apiKey = resolveGeminiApiKey(req);
      if (!apiKey) {
        throw new ApiError(401, 'أدخل مفتاح Gemini API للمتابعة.', 'API_KEY_REQUIRED');
      }
      resultImage = await editWithGemini(apiKey, input, requestAbort.signal, geminiRequestContext(req));
    } else if (isOpenAIModel(input.model)) {
      if (!isOpenAIEnabled()) {
        throw new ApiError(400, 'موديلات OpenAI معطلة في وضع Google AI Studio.', 'OPENAI_DISABLED');
      }
      const apiKey = resolveOpenAIApiKey(req);
      if (!apiKey) {
        throw new ApiError(401, 'مفتاح OpenAI غير مضبوط على الخادم.', 'OPENAI_KEY_REQUIRED');
      }
      resultImage = await editWithOpenAI(apiKey, input, requestAbort.signal);
    } else {
      throw new ApiError(400, 'الموديل المختار غير مدعوم.', 'UNSUPPORTED_MODEL');
    }

    if (!res.writableEnded) {
      res.json({ resultImage, requestId: res.locals.requestId });
    }
  } catch (error) {
    next(error);
  } finally {
    requestAbort.cleanup();
  }
});

apiRouter.post('/merge-batch', mergeUploadMiddleware, async (req, res, next) => {
  const requestAbort = createRequestAbortController(req, res);
  try {
    const input = mergeBatchRequestSchema.parse(mergeBody(req));
    if (!isGeminiModel(input.model)) {
      throw new ApiError(400, 'دمج الباتش متاح حاليًا مع موديلات Gemini فقط.', 'UNSUPPORTED_MODEL');
    }

    const apiKey = resolveGeminiApiKey(req);
    if (!apiKey) {
      throw new ApiError(401, 'أدخل مفتاح Gemini API للمتابعة.', 'API_KEY_REQUIRED');
    }

    const resultImage = await mergeWithGemini(apiKey, input, requestAbort.signal, geminiRequestContext(req));
    if (!res.writableEnded) {
      res.json({ resultImage, requestId: res.locals.requestId });
    }
  } catch (error) {
    next(error);
  } finally {
    requestAbort.cleanup();
  }
});

apiRouter.use((_req, res) => {
  res.status(404).json({
    error: 'مسار API غير موجود.',
    code: 'API_ROUTE_NOT_FOUND',
    requestId: res.locals.requestId,
  });
});

apiRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent || res.writableEnded) return;

  const requestId = res.locals.requestId as string | undefined;
  if (isAbortError(error)) {
    res.status(499).json({ error: 'تم إلغاء الطلب.', code: 'REQUEST_ABORTED', requestId });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: error.issues[0]?.message || 'بيانات الطلب غير صالحة.',
      code: 'INVALID_REQUEST',
      requestId,
    });
    return;
  }

  const status = error instanceof ApiError
    ? error.status
    : isAuthenticationError(error)
      ? 401
      : isAccessDeniedError(error)
        ? 403
      : isQuotaError(error)
        ? 429
        : 500;
  const code = error instanceof ApiError
    ? error.code
    : isAuthenticationError(error)
      ? 'API_KEY_INVALID'
      : isAccessDeniedError(error)
        ? 'MODEL_ACCESS_DENIED'
      : isQuotaError(error)
        ? 'QUOTA_EXCEEDED'
        : 'PROCESSING_FAILED';

  if (!(error instanceof ApiError)) {
    const details = typeof error === 'object' && error !== null ? {
      name: error instanceof Error ? error.name : 'UnknownError',
      providerStatus: 'status' in error ? Number(error.status) || undefined : undefined,
      providerCode: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    } : { name: typeof error };
    console.error(`[${requestId || 'unknown'}] Image provider request failed`, details);
  }

  res.status(status).json({
    error: publicErrorMessage(error),
    code,
    requestId,
  });
});
