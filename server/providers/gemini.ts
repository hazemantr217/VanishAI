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
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function generateContentConfig(
  input: Pick<InpaintInput, 'aspectRatio' | 'similarityLevel'>,
  signal?: AbortSignal,
) {
  const temperature = input.similarityLevel === 'high'
    ? 0.15
    : input.similarityLevel === 'medium'
      ? 0.5
      : 1;

  let imageConfig: { aspectRatio?: string } | undefined = undefined;
  if (input.aspectRatio && input.aspectRatio !== 'original') {
    const validRatios = ['1:1', '3:4', '4:3', '9:16', '16:9', '1:4', '1:8', '4:1', '8:1'];
    if (validRatios.includes(input.aspectRatio)) {
      imageConfig = { aspectRatio: input.aspectRatio };
    }
  }

  return {
    ...(signal ? { abortSignal: signal } : {}),
    temperature,
    ...(imageConfig ? { imageConfig } : {}),
  };
}

export async function editWithGemini(
  apiKey: string,
  input: InpaintInput,
  signal: AbortSignal,
): Promise<string> {
  const ai = createClient(apiKey);
  const masked = parseImageDataUrl(input.maskedImage);

  const parts: GenerateContentPart[] = [
    {
      inlineData: {
        data: masked.base64,
        mimeType: masked.mimeType,
      },
    },
    { text: buildImageEditPrompt(input) },
  ];

  const response = await ai.models.generateContent({
    model: input.model,
    contents: parts,
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
    contents: parts,
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
