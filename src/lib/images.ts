import type { BatchItem } from '../types';

const SUPPORTED_UPLOAD_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تعذر قراءة بيانات الصورة.'));
    image.src = dataUrl;
  });
}

const pngDataUrlCache = new Map<string, string>();

export async function toPngDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:image/png;')) return imageUrl;
  const cached = pngDataUrlCache.get(imageUrl);
  if (cached) return cached;

  const image = await loadImage(imageUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Canvas غير متاح لتحويل الصورة إلى PNG.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png');

  if (pngDataUrlCache.size >= 10) {
    const oldest = pngDataUrlCache.keys().next().value as string | undefined;
    if (oldest) pngDataUrlCache.delete(oldest);
  }
  pngDataUrlCache.set(imageUrl, png);
  return png;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error(`تعذر قراءة الملف ${file.name}.`));
    };
    reader.onerror = () => reject(reader.error || new Error(`فشل تحميل الملف ${file.name}.`));
    reader.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    reader.readAsDataURL(file);
  });
}

export async function filesToBatchItems(
  files: File[],
  createId: () => string,
): Promise<{ items: BatchItem[]; failedFiles: string[] }> {
  const imageFiles = files.filter((file) =>
    SUPPORTED_UPLOAD_MIME_TYPES.has(file.type) && file.size <= MAX_UPLOAD_BYTES,
  );
  const failedFiles = files
    .filter((file) => file.type.startsWith('image/') && !imageFiles.includes(file))
    .map((file) => file.name);
  const results = await Promise.allSettled(imageFiles.map(readFileAsDataUrl));
  const baseTime = Date.now();
  const items: BatchItem[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push({
        id: createId(),
        initialImage: result.value,
        originalImage: result.value,
        editHistory: [],
        maskedImage: null,
        resultImage: null,
        status: 'pending',
        createdAt: baseTime - index,
      });
    } else {
      failedFiles.push(imageFiles[index]?.name || `image-${index + 1}`);
    }
  });

  return { items, failedFiles };
}

export function dataUrlExtension(dataUrl: string): 'png' | 'jpg' | 'webp' {
  const mimeType = /^data:(image\/[^;]+);/i.exec(dataUrl)?.[1]?.toLowerCase();
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function filenameForDataUrl(baseName: string, dataUrl: string): string {
  const withoutExtension = baseName.replace(/\.(?:png|jpe?g|webp)$/i, '');
  return `${withoutExtension}.${dataUrlExtension(dataUrl)}`;
}

/**
 * Composites the generated image only into the transparent part of the OpenAI-style
 * mask. Opaque mask pixels are copied exactly from the original image.
 */
export async function lockPixelsOutsideMask(
  originalUrl: string,
  generatedUrl: string,
  dalleMaskUrl: string,
): Promise<string> {
  const [original, generated, mask] = await Promise.all([
    loadImage(originalUrl),
    loadImage(generatedUrl),
    loadImage(dalleMaskUrl),
  ]);

  const width = original.naturalWidth || original.width;
  const height = original.naturalHeight || original.height;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d', { alpha: true });
  if (!outputContext) throw new Error('Canvas غير متاح لدمج النتيجة.');
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  outputContext.drawImage(original, 0, 0, width, height);

  const generatedCanvas = document.createElement('canvas');
  generatedCanvas.width = width;
  generatedCanvas.height = height;
  const generatedContext = generatedCanvas.getContext('2d', { alpha: true });
  if (!generatedContext) throw new Error('Canvas غير متاح لقفل البكسلات.');
  generatedContext.imageSmoothingEnabled = true;
  generatedContext.imageSmoothingQuality = 'high';
  generatedContext.drawImage(generated, 0, 0, width, height);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskContext) throw new Error('Canvas غير متاح لقراءة القناع.');
  maskContext.drawImage(mask, 0, 0, width, height);
  const maskPixels = maskContext.getImageData(0, 0, width, height);
  for (let index = 0; index < maskPixels.data.length; index += 4) {
    const selectionAlpha = 255 - maskPixels.data[index + 3];
    maskPixels.data[index] = 255;
    maskPixels.data[index + 1] = 255;
    maskPixels.data[index + 2] = 255;
    maskPixels.data[index + 3] = selectionAlpha;
  }
  maskContext.putImageData(maskPixels, 0, 0);

  generatedContext.globalCompositeOperation = 'destination-in';
  generatedContext.drawImage(maskCanvas, 0, 0);
  outputContext.drawImage(generatedCanvas, 0, 0);
  return output.toDataURL('image/png');
}
