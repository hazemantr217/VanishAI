import type {
  ApiErrorResponse,
  ImageResultResponse,
  InpaintRequest,
  MergeBatchRequest,
  RuntimeConfig,
} from '../shared/api';
import { imageUrlToBlob, toManagedImageUrl } from '../lib/image-urls';

const SESSION_KEY = 'vanishai_gemini_api_key';
let inMemoryGeminiApiKey = '';

function readSessionKey(): string {
  if (inMemoryGeminiApiKey) return inMemoryGeminiApiKey;
  try {
    inMemoryGeminiApiKey = sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    // Some privacy modes disable sessionStorage. Memory-only mode still works.
  }
  return inMemoryGeminiApiKey;
}

export function hasSessionGeminiApiKey(): boolean {
  return Boolean(readSessionKey());
}

export function setSessionGeminiApiKey(apiKey: string): void {
  inMemoryGeminiApiKey = apiKey.trim();
  try {
    sessionStorage.setItem(SESSION_KEY, inMemoryGeminiApiKey);
  } catch {
    // Keep the key in memory when sessionStorage is unavailable.
  }
}

export function clearSessionGeminiApiKey(): void {
  inMemoryGeminiApiKey = '';
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Nothing else to clear.
  }
}

async function parseApiError(response: Response): Promise<Error> {
  let payload: ApiErrorResponse | null = null;
  try {
    payload = await response.json() as ApiErrorResponse;
  } catch {
    // Fall back to the status text without exposing an HTML error response.
  }

  const error = new Error(payload?.error || `فشل الطلب (${response.status}).`);
  error.name = payload?.code || 'API_ERROR';
  return error;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  options: { includeGeminiKey?: boolean; retryRateLimit?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Vanish-Request', '1');

  if (options.includeGeminiKey) {
    const apiKey = readSessionKey();
    if (apiKey) headers.set('X-Gemini-Api-Key', apiKey);
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(path, { ...init, headers });
    if (response.ok) return response.json() as Promise<T>;

    if (response.status === 429 && options.retryRateLimit && attempt === 0) {
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '1', 10);
      await abortableDelay(Math.min(10, Math.max(1, retryAfter)) * 1000, init.signal || undefined);
      continue;
    }
    throw await parseApiError(response);
  }

  throw new Error('فشل الطلب بعد إعادة المحاولة.');
}

export async function getRuntimeConfig(signal?: AbortSignal): Promise<RuntimeConfig> {
  return apiRequest<RuntimeConfig>('/api/runtime-config', { signal });
}

export async function verifyGeminiApiKey(apiKey: string, signal?: AbortSignal): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('X-Gemini-Api-Key', apiKey.trim());
  await apiRequest<{ valid: true }>('/api/credentials/verify', {
    method: 'POST',
    headers,
    body: '{}',
    signal,
  });
}

export async function requestInpaint(
  payload: InpaintRequest,
  signal?: AbortSignal,
): Promise<ImageResultResponse> {
  const { originalImage, maskedImage, dalleMaskImage, ...metadata } = payload;
  const formData = new FormData();
  formData.set('metadata', JSON.stringify(metadata));
  const [originalBlob, maskedBlob, dalleMaskBlob] = await Promise.all([
    imageUrlToBlob(originalImage),
    imageUrlToBlob(maskedImage),
    dalleMaskImage ? imageUrlToBlob(dalleMaskImage) : null,
  ]);
  formData.set('originalImage', originalBlob, filenameForBlob('original', originalBlob));
  formData.set('maskedImage', maskedBlob, filenameForBlob('masked', maskedBlob));
  if (dalleMaskBlob) formData.set('dalleMaskImage', dalleMaskBlob, filenameForBlob('mask', dalleMaskBlob));

  const response = await apiRequest<ImageResultResponse>('/api/inpaint', {
    method: 'POST',
    body: formData,
    signal,
  }, { includeGeminiKey: true, retryRateLimit: true });
  return { ...response, resultImage: await toManagedImageUrl(response.resultImage) };
}

export async function requestBatchMerge(
  payload: MergeBatchRequest,
  signal?: AbortSignal,
): Promise<ImageResultResponse> {
  const { images, ...metadata } = payload;
  const formData = new FormData();
  formData.set('metadata', JSON.stringify(metadata));
  const blobs = await Promise.all(images.map(imageUrlToBlob));
  blobs.forEach((blob, index) => {
    formData.append('images', blob, filenameForBlob(`image-${index + 1}`, blob));
  });

  const response = await apiRequest<ImageResultResponse>('/api/merge-batch', {
    method: 'POST',
    body: formData,
    signal,
  }, { includeGeminiKey: true, retryRateLimit: true });
  return { ...response, resultImage: await toManagedImageUrl(response.resultImage) };
}

function filenameForBlob(stem: string, blob: Blob): string {
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return `${stem}.${extension}`;
}
