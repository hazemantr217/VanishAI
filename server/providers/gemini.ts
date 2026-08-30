import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import type { inpaintRequestSchema, mergeBatchRequestSchema } from '../validation';
import { buildImageEditPrompt, buildMergePrompt } from '../prompts';
import { extractGenerateContentImage, parseImageDataUrl } from '../image-data';

type InpaintInput = z.infer<typeof inpaintRequestSchema>;
type MergeInput = z.infer<typeof mergeBatchRequestSchema>;

type GenerateContentPart =
  | { inlineData: { data: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' } }
  | { text: string };

function createClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'vanish-ai/1.0 aistudio-build',
      },
    },
  });
}

export function generateContentConfig(
  input: Pick<InpaintInput, 'aspectRatio' | 'imageSize' | 'similarityLevel'>,
  signal?: AbortSignal,
) {
  const imageConfig = {
    ...(input.aspectRatio === 'original' ? {} : { aspectRatio: input.aspectRatio }),
    // 1K is Gemini's default. Omitting it preserves the exact request shape
    // used by the original AI Studio implementation and keeps Lite compatible.
    ...(input.imageSize === '1K' ? {} : { imageSize: input.imageSize }),
  };
  const temperature = input.similarityLevel === 'high'
    ? 0.15
    : input.similarityLevel === 'medium'
      ? 0.5
      : 1;

  return {
    ...(signal ? { abortSignal: signal } : {}),
    temperature,
    ...(Object.keys(imageConfig).length > 0 ? { imageConfig } : {}),
  };
}

export async function editWithGemini(
  apiKey: string,
  input: InpaintInput,
  signal: AbortSignal,
): Promise<string> {
  const ai = createClient(apiKey);
  const original = parseImageDataUrl(input.originalImage);
  const masked = parseImageDataUrl(input.maskedImage);
  const hasSeparateMaskReference = input.maskedImage !== input.originalImage;

  const parts: GenerateContentPart[] = [
    {
      inlineData: {
        data: original.base64,
        mimeType: original.mimeType,
      },
    },
    ...(hasSeparateMaskReference
      ? [{
          inlineData: {
            data: masked.base64,
            mimeType: masked.mimeType,
          },
        }]
      : []),
    { text: buildImageEditPrompt(input) },
  ];

  const response = await ai.models.generateContent({
    model: input.model,
    contents: { parts },
    config: generateContentConfig(input, signal),
  });

  return extractGenerateContentImage(response);
}

export async function mergeWithGemini(
  apiKey: string,
  input: MergeInput,
  signal: AbortSignal,
): Promise<string> {
  const ai = createClient(apiKey);
  const parts: GenerateContentPart[] = input.images.map((image) => {
    const parsed = parseImageDataUrl(image);
    return {
      inlineData: {
        data: parsed.base64,
        mimeType: parsed.mimeType,
      },
    };
  });

  parts.push({ text: buildMergePrompt(input) });

  const response = await ai.models.generateContent({
    model: input.model,
    contents: { parts },
    config: generateContentConfig(input, signal),
  });

  return extractGenerateContentImage(response);
}

export async function verifyGeminiKey(apiKey: string, signal: AbortSignal): Promise<void> {
  const ai = createClient(apiKey);
  await ai.models.get({
    model: 'gemini-3.1-flash-lite-image',
    config: { abortSignal: signal },
  });
}
