import { ApiError } from './errors';

const IMAGE_DATA_URL_PATTERN = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=\r\n]+)$/;

export interface ParsedImageDataUrl {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  base64: string;
  bytes: Buffer;
}

export function parseImageDataUrl(value: string): ParsedImageDataUrl {
  const match = IMAGE_DATA_URL_PATTERN.exec(value);
  if (!match) {
    throw new ApiError(400, 'صيغة الصورة غير صحيحة.', 'INVALID_IMAGE');
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) {
    throw new ApiError(400, 'ملف الصورة فارغ.', 'EMPTY_IMAGE');
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  return {
    mimeType: mimeType as ParsedImageDataUrl['mimeType'],
    base64: match[2],
    bytes,
  };
}

export function imageFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function extractInteractionImage(interaction: {
  output_image?: { data?: string; mime_type?: string };
}): string {
  const image = interaction.output_image;
  if (!image?.data) {
    throw new ApiError(422, 'لم يُرجع الموديل صورة صالحة.', 'NO_IMAGE_RESULT');
  }
  return `data:${image.mime_type || 'image/png'};base64,${image.data}`;
}
