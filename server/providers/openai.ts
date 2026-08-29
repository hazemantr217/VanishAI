import OpenAI, { toFile } from 'openai';
import type { z } from 'zod';
import type { inpaintRequestSchema } from '../validation';
import { ApiError } from '../errors';
import { imageFileExtension, parseImageDataUrl } from '../image-data';
import { buildImageEditPrompt } from '../prompts';

type InpaintInput = z.infer<typeof inpaintRequestSchema>;

function roundToMultipleOf16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16);
}

export function openAIOutputSize(input: Pick<InpaintInput, 'model' | 'aspectRatio' | 'imageSize'>): string {
  if (input.aspectRatio === 'original') return 'auto';
  const [widthPart, heightPart] = input.aspectRatio.split(':').map(Number);
  const ratio = widthPart / heightPart;

  if (input.model !== 'gpt-image-2') {
    if (ratio > 1.1) return '1536x1024';
    if (ratio < 0.9) return '1024x1536';
    return '1024x1024';
  }

  const requestedLongEdge = input.imageSize === '4K'
    ? 3840
    : input.imageSize === '2K'
      ? 2048
      : ratio === 1
        ? 1024
        : 1536;
  let width = ratio >= 1 ? requestedLongEdge : requestedLongEdge * ratio;
  let height = ratio >= 1 ? requestedLongEdge / ratio : requestedLongEdge;

  const maximumPixels = 8_294_400;
  if (width * height > maximumPixels) {
    const scale = Math.sqrt(maximumPixels / (width * height));
    width *= scale;
    height *= scale;
  }

  return `${roundToMultipleOf16(width)}x${roundToMultipleOf16(height)}`;
}

export async function editWithOpenAI(
  apiKey: string,
  input: InpaintInput,
  signal: AbortSignal,
): Promise<string> {
  const client = new OpenAI({ apiKey });
  const original = parseImageDataUrl(input.originalImage);
  const image = await toFile(
    original.bytes,
    `original.${imageFileExtension(original.mimeType)}`,
    { type: original.mimeType },
  );

  let mask: Awaited<ReturnType<typeof toFile>> | undefined;
  if (input.appMode === 'vanish') {
    if (!input.dalleMaskImage) {
      throw new ApiError(400, 'يلزم قناع PNG صالح لإجراء inpainting.', 'MASK_REQUIRED');
    }
    const parsedMask = parseImageDataUrl(input.dalleMaskImage);
    if (parsedMask.mimeType !== 'image/png' || original.mimeType !== 'image/png') {
      throw new ApiError(400, 'يجب أن تكون الصورة والقناع بصيغة PNG عند استخدام OpenAI inpainting.', 'PNG_MASK_REQUIRED');
    }
    mask = await toFile(parsedMask.bytes, 'mask.png', { type: 'image/png' });
  }

  const response = await client.images.edit(
    {
      model: input.model,
      image,
      ...(mask ? { mask } : {}),
      prompt: buildImageEditPrompt(input),
      ...(input.model === 'gpt-image-2' ? {} : { input_fidelity: 'high' as const }),
      quality: input.imageSize === '1K' ? 'medium' : 'high',
      size: openAIOutputSize(input),
      output_format: 'png',
      n: 1,
    },
    { signal },
  );

  const generated = response.data?.[0]?.b64_json;
  if (!generated) {
    throw new ApiError(422, 'لم يُرجع موديل OpenAI صورة صالحة.', 'NO_IMAGE_RESULT');
  }
  return `data:image/png;base64,${generated}`;
}
