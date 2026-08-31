import type {
  ApiErrorResponse,
  ImageResultResponse,
  InpaintRequest,
  MergeBatchRequest,
  RuntimeConfig,
} from '../shared/api';
import { imageUrlToBlob, imageUrlToDataUrl, toManagedImageUrl } from '../lib/image-urls';
import { isGeminiModel } from '../shared/models';
import { isGoogleAIStudioBrowser } from '../shared/ai-studio';

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
    // Fall back to the status without exposing an HTML error response.
  }

  if (response.status === 403 && !payload?.error && !response.headers.get('x-request-id')) {
    const proxyError = new Error(
      'حجب Google AI Studio Preview الطلب قبل وصوله إلى خادم التطبيق. أعد تشغيل Preview ثم أعد المحاولة.',
    );
    proxyError.name = 'AI_STUDIO_PROXY_FORBIDDEN';
    return proxyError;
  }

  if (payload?.error) {
    const error = new Error(payload.error);
    error.name = payload.code || 'API_ERROR';
    return error;
  }

  if (response.status === 401) {
    const error = new Error('مفتاح API غير متوفر أو غير صالح. يرجى إدخال مفتاح صالح.');
    error.name = 'API_KEY_REQUIRED';
    return error;
  }

  const error = new Error(`فشل الطلب (${response.status} ${response.statusText || ''}).`);
  error.name = payload?.code || 'API_ERROR';
  return error;
}

export function shouldAttachGeminiSessionKey(aiStudioBrowser = isGoogleAIStudioBrowser()): boolean {
  return !aiStudioBrowser;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  options: { includeGeminiKey?: boolean; requestMarker?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (options.requestMarker !== false) headers.set('X-Vanish-Request', '1');

  if (options.includeGeminiKey && shouldAttachGeminiSessionKey()) {
    const apiKey = readSessionKey();
    if (apiKey) headers.set('X-Gemini-Api-Key', apiKey);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.ok) return response.json() as Promise<T>;
  throw await parseApiError(response);
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
  if (isGeminiModel(payload.model)) {
    // Preserve the transport used by the original working AI Studio build.
    // In particular, do not send an image-size field or a custom marker through
    // AI Studio's preview proxy.
    const {
      imageSize: _ignoredImageSize,
      originalImage: _originalImage,
      dalleMaskImage: _dalleMaskImage,
      ...originalGeminiPayload
    } = payload;
    const maskedImage = await imageUrlToDataUrl(originalGeminiPayload.maskedImage);
    const jsonPayload = {
      ...originalGeminiPayload,
      maskedImage,
    };
    const response = await apiRequest<ImageResultResponse>('/api/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jsonPayload),
      signal,
    }, { includeGeminiKey: true, requestMarker: false });
    return { ...response, resultImage: await toManagedImageUrl(response.resultImage) };
  }

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
  }, { includeGeminiKey: true });
  return { ...response, resultImage: await toManagedImageUrl(response.resultImage) };
}

export async function requestBatchMerge(
  payload: MergeBatchRequest,
  signal?: AbortSignal,
): Promise<ImageResultResponse> {
  const { imageSize: _ignoredImageSize, ...originalPayload } = payload;
  const images = await Promise.all(originalPayload.images.map(imageUrlToDataUrl));
  const response = await apiRequest<ImageResultResponse>('/api/merge-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...originalPayload, images }),
    signal,
  }, { includeGeminiKey: true, requestMarker: false });
  return { ...response, resultImage: await toManagedImageUrl(response.resultImage) };
}

function filenameForBlob(stem: string, blob: Blob): string {
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return `${stem}.${extension}`;
}
