import { GoogleGenAI } from '@google/genai';
import { buildImageEditPrompt, buildMergePrompt } from '../../server/prompts';
import type { InpaintRequest, MergeBatchRequest } from '../shared/api';
import { isGoogleAIStudioBrowser } from '../shared/ai-studio';
import { imageUrlToDataUrl } from '../lib/image-urls';

const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

function injectedPreviewApiKey(): string {
  return (process.env.GEMINI_API_KEY || '').trim();
}

export function canUseAIStudioPreviewGemini(
  aiStudioBrowser = isGoogleAIStudioBrowser(),
  apiKey = injectedPreviewApiKey(),
): boolean {
  return aiStudioBrowser && Boolean(apiKey.trim());
}

function previewClient(): GoogleGenAI {
  const apiKey = injectedPreviewApiKey();
  if (!apiKey) {
    const error = new Error('تعذر تحميل اتصال Gemini الافتراضي في AI Studio Preview.');
    error.name = 'AI_STUDIO_PREVIEW_KEY_UNAVAILABLE';
    throw error;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

function parseImageDataUrl(value: string): {
  data: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
} {
  const match = IMAGE_DATA_URL_PATTERN.exec(value);
  if (!match?.[2]) {
    const error = new Error('صيغة الصورة غير مدعومة. استخدم PNG أو JPEG أو WebP.');
    error.name = 'INVALID_IMAGE';
    throw error;
  }
  return {
    data: match[2],
    mimeType: (match[1] === 'image/jpg' ? 'image/jpeg' : match[1]) as 'image/png' | 'image/jpeg' | 'image/webp',
  };
}

function generationConfig(
  input: Pick<InpaintRequest, 'aspectRatio' | 'similarityLevel'>,
  signal?: AbortSignal,
) {
  const temperature = input.similarityLevel === 'high'
    ? 0.15
    : input.similarityLevel === 'medium'
      ? 0.5
      : 1;
  return {
    ...(signal ? { abortSignal: signal } : {}),
    temperature,
    ...(input.aspectRatio === 'original' ? {} : { imageConfig: { aspectRatio: input.aspectRatio } }),
  };
}

function extractImage(response: {
  candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string }; text?: string }> } }>;
}): string {
  let modelText = '';
  for (const candidate of response.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
      if (part.text) modelText += part.text;
    }
  }
  const error = new Error(modelText
    ? `لم يُرجع الموديل صورة صالحة: ${modelText.slice(0, 150)}`
    : 'لم يُرجع الموديل صورة صالحة.');
  error.name = 'NO_IMAGE_RESULT';
  throw error;
}

export async function editWithAIStudioPreview(
  input: InpaintRequest,
  signal?: AbortSignal,
): Promise<string> {
  const image = parseImageDataUrl(await imageUrlToDataUrl(input.maskedImage));
  const response = await previewClient().models.generateContent({
    model: input.model,
    contents: {
      parts: [
        { inlineData: image },
        {
          text: buildImageEditPrompt({
            prompt: input.prompt || '',
            maskColor: input.maskColor,
            appMode: input.appMode,
            aspectRatio: input.aspectRatio,
            enableOutpainting: Boolean(input.enableOutpainting),
            outpaintPreserve2D: input.outpaintPreserve2D !== false,
          }),
        },
      ],
    },
    config: generationConfig(input, signal),
  });
  return extractImage(response);
}

export async function mergeWithAIStudioPreview(
  input: MergeBatchRequest,
  signal?: AbortSignal,
): Promise<string> {
  const images = await Promise.all(input.images.map(async (image) =>
    parseImageDataUrl(await imageUrlToDataUrl(image))));
  const response = await previewClient().models.generateContent({
    model: input.model,
    contents: {
      parts: [
        ...images.map((inlineData) => ({ inlineData })),
        {
          text: buildMergePrompt({
            prompt: input.prompt || '',
            aspectRatio: input.aspectRatio,
          }),
        },
      ],
    },
    config: generationConfig(input, signal),
  });
  return extractImage(response);
}
