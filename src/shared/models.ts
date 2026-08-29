export const GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
] as const;

export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number];

export const OPENAI_IMAGE_MODELS = [
  'gpt-image-1.5',
  'gpt-image-2',
] as const;

export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODELS)[number];
export type ImageModel = GeminiImageModel | OpenAIImageModel;

export const SUPPORTED_ASPECT_RATIOS = [
  'original',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;

export type AspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

export const SUPPORTED_IMAGE_SIZES = ['1K', '2K', '4K'] as const;
export type ImageSize = (typeof SUPPORTED_IMAGE_SIZES)[number];

export function isGeminiModel(model: string): model is GeminiImageModel {
  return GEMINI_IMAGE_MODELS.includes(model as GeminiImageModel);
}

export function isOpenAIModel(model: string): model is OpenAIImageModel {
  return OPENAI_IMAGE_MODELS.includes(model as OpenAIImageModel);
}

export function isSupportedAspectRatio(value: string): value is AspectRatio {
  return SUPPORTED_ASPECT_RATIOS.includes(value as AspectRatio);
}

export function supportsImageSize(model: ImageModel, imageSize: ImageSize): boolean {
  if (model === 'gemini-3.1-flash-lite-image' || model === 'gpt-image-1.5') {
    return imageSize === '1K';
  }
  return true;
}
