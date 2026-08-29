import { z } from 'zod';
import {
  GEMINI_IMAGE_MODELS,
  OPENAI_IMAGE_MODELS,
  SUPPORTED_ASPECT_RATIOS,
  SUPPORTED_IMAGE_SIZES,
  supportsImageSize,
} from '../src/shared/models';

const MAX_DATA_URL_LENGTH = 60 * 1024 * 1024;

const imageDataUrl = z
  .string()
  .min(32)
  .max(MAX_DATA_URL_LENGTH)
  .regex(
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/,
    'صيغة الصورة غير مدعومة. استخدم PNG أو JPEG أو WebP.',
  );

const modelSchema = z.enum([...GEMINI_IMAGE_MODELS, ...OPENAI_IMAGE_MODELS]);
const aspectRatioSchema = z.enum(SUPPORTED_ASPECT_RATIOS);
const imageSizeSchema = z.enum(SUPPORTED_IMAGE_SIZES);
const similaritySchema = z.enum(['high', 'medium', 'low']).default('high');

export const inpaintRequestSchema = z.object({
  maskedImage: imageDataUrl,
  originalImage: imageDataUrl,
  dalleMaskImage: imageDataUrl.nullish(),
  prompt: z.string().max(32_000).default(''),
  maskColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  model: modelSchema,
  appMode: z.enum(['vanish', 'reimagine']),
  aspectRatio: aspectRatioSchema.default('original'),
  imageSize: imageSizeSchema.default('1K'),
  enableOutpainting: z.boolean().default(false),
  outpaintPreserve2D: z.boolean().default(true),
  similarityLevel: similaritySchema,
}).strict().superRefine((input, context) => {
  if (!supportsImageSize(input.model, input.imageSize)) {
    context.addIssue({
      code: 'custom',
      path: ['imageSize'],
      message: 'الموديل المختار يدعم دقة 1K فقط.',
    });
  }
});

export const mergeBatchRequestSchema = z.object({
  images: z.array(imageDataUrl).min(1).max(14),
  prompt: z.string().max(32_000).default(''),
  model: modelSchema,
  aspectRatio: aspectRatioSchema.default('original'),
  imageSize: imageSizeSchema.default('1K'),
  similarityLevel: similaritySchema,
}).strict().superRefine((input, context) => {
  if (!supportsImageSize(input.model, input.imageSize)) {
    context.addIssue({
      code: 'custom',
      path: ['imageSize'],
      message: 'الموديل المختار يدعم دقة 1K فقط.',
    });
  }
});
