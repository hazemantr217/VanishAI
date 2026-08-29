import { GoogleGenAI } from '@google/genai';
import type { z } from 'zod';
import type { inpaintRequestSchema, mergeBatchRequestSchema } from '../validation';
import { buildImageEditPrompt, buildMergePrompt } from '../prompts';
import { extractInteractionImage, parseImageDataUrl } from '../image-data';

type InpaintInput = z.infer<typeof inpaintRequestSchema>;
type MergeInput = z.infer<typeof mergeBatchRequestSchema>;

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

function responseFormat(input: { aspectRatio: string; imageSize: string }) {
  return {
    type: 'image',
    mime_type: 'image/png',
    ...(input.aspectRatio === 'original' ? {} : { aspect_ratio: input.aspectRatio }),
    image_size: input.imageSize,
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

  const interactionInput = [
    {
      type: 'image' as const,
      data: original.base64,
      mime_type: original.mimeType,
    },
    ...(hasSeparateMaskReference
      ? [{
          type: 'image' as const,
          data: masked.base64,
          mime_type: masked.mimeType,
        }]
      : []),
    { type: 'text' as const, text: buildImageEditPrompt(input) },
  ];

  const interaction = await ai.interactions.create({
    model: input.model,
    input: interactionInput,
    response_format: responseFormat(input),
    response_modalities: ['image'],
    store: false,
    stream: false,
  }, { signal });

  return extractInteractionImage(interaction);
}

export async function mergeWithGemini(
  apiKey: string,
  input: MergeInput,
  signal: AbortSignal,
): Promise<string> {
  const ai = createClient(apiKey);
  const interactionInput: Array<
    { type: 'image'; data: string; mime_type: 'image/png' | 'image/jpeg' | 'image/webp' } |
    { type: 'text'; text: string }
  > = input.images.map((image) => {
    const parsed = parseImageDataUrl(image);
    return {
      type: 'image',
      data: parsed.base64,
      mime_type: parsed.mimeType,
    };
  });

  interactionInput.push({ type: 'text', text: buildMergePrompt(input) });

  const interaction = await ai.interactions.create({
    model: input.model,
    input: interactionInput,
    response_format: responseFormat(input),
    response_modalities: ['image'],
    store: false,
    stream: false,
  }, { signal });

  return extractInteractionImage(interaction);
}

export async function verifyGeminiKey(apiKey: string, signal: AbortSignal): Promise<void> {
  const ai = createClient(apiKey);
  await ai.models.get({
    model: 'gemini-3.1-flash-lite-image',
    config: { abortSignal: signal },
  });
}
