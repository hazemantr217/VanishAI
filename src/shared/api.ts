import type { AspectRatio, ImageModel, ImageSize } from './models';

export type CredentialMode = 'managed' | 'byok';

export interface RuntimeConfig {
  geminiCredentialMode: CredentialMode;
  googleOnlyMode: boolean;
  openaiAvailable: boolean;
}

export interface InpaintRequest {
  maskedImage: string;
  originalImage: string;
  dalleMaskImage?: string | null;
  prompt?: string;
  maskColor?: string;
  model: ImageModel;
  appMode: 'vanish' | 'reimagine';
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  enableOutpainting?: boolean;
  outpaintPreserve2D?: boolean;
  similarityLevel?: 'high' | 'medium' | 'low';
}

export interface MergeBatchRequest {
  images: string[];
  prompt?: string;
  model: ImageModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  similarityLevel?: 'high' | 'medium' | 'low';
}

export interface ImageResultResponse {
  resultImage: string;
  requestId: string;
}

export interface ApiErrorResponse {
  error: string;
  code?: string;
  requestId?: string;
}
