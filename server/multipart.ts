import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ApiError } from './errors';

const MAX_IMAGE_BYTES = 45 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 14,
    fields: 1,
    parts: 16,
  },
  fileFilter: (_req, file, callback) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(new ApiError(400, 'صيغة الصورة غير مدعومة. استخدم PNG أو JPEG أو WebP.', 'INVALID_IMAGE_TYPE'));
      return;
    }
    callback(null, true);
  },
});

function multipartOnly(middleware: ReturnType<typeof upload.fields>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }

    middleware(req as any, res as any, (error: unknown) => {
      if (error instanceof multer.MulterError) {
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        next(new ApiError(
          tooLarge ? 413 : 400,
          tooLarge ? 'حجم إحدى الصور أكبر من الحد المسموح.' : 'بيانات رفع الصور غير صالحة.',
          tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_MULTIPART_REQUEST',
        ));
        return;
      }
      next(error);
    });
  };
}

export const inpaintUploadMiddleware = multipartOnly(upload.fields([
  { name: 'originalImage', maxCount: 1 },
  { name: 'maskedImage', maxCount: 1 },
  { name: 'dalleMaskImage', maxCount: 1 },
]));

export const mergeUploadMiddleware = multipartOnly(upload.fields([
  { name: 'images', maxCount: 14 },
]));

function parseMetadata(req: Request): Record<string, unknown> {
  if (!req.is('multipart/form-data')) return req.body as Record<string, unknown>;
  if (typeof req.body?.metadata !== 'string') {
    throw new ApiError(400, 'بيانات الطلب الوصفية مفقودة.', 'INVALID_MULTIPART_REQUEST');
  }

  try {
    const parsed = JSON.parse(req.body.metadata) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid metadata');
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'بيانات الطلب الوصفية غير صالحة.', 'INVALID_MULTIPART_REQUEST');
  }
}

function imageDataUrl(file: Express.Multer.File | undefined): string | undefined {
  if (!file) return undefined;
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

function fileMap(req: Request): Record<string, Express.Multer.File[]> {
  if (!req.files || Array.isArray(req.files)) return {};
  return req.files;
}

export function inpaintBody(req: Request): Record<string, unknown> {
  if (!req.is('multipart/form-data')) return req.body as Record<string, unknown>;
  const metadata = parseMetadata(req);
  const files = fileMap(req);
  return {
    ...metadata,
    originalImage: imageDataUrl(files.originalImage?.[0]),
    maskedImage: imageDataUrl(files.maskedImage?.[0]),
    dalleMaskImage: imageDataUrl(files.dalleMaskImage?.[0]) ?? null,
  };
}

export function mergeBody(req: Request): Record<string, unknown> {
  if (!req.is('multipart/form-data')) return req.body as Record<string, unknown>;
  const metadata = parseMetadata(req);
  const files = fileMap(req);
  return {
    ...metadata,
    images: (files.images || []).map((file) => imageDataUrl(file)),
  };
}
