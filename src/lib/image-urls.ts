const managedImageUrls = new Map<string, string>();
const pendingRevocations = new Map<string, number>();

export function createManagedImageUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  managedImageUrls.set(url, blob.type || 'image/jpeg');
  return url;
}

export function revokeManagedImageUrl(url: string | null | undefined): void {
  if (!url || !managedImageUrls.has(url)) return;
  const timer = pendingRevocations.get(url);
  if (timer !== undefined) window.clearTimeout(timer);
  pendingRevocations.delete(url);
  URL.revokeObjectURL(url);
  managedImageUrls.delete(url);
}

export function cancelManagedImageUrlRevocation(url: string): void {
  const timer = pendingRevocations.get(url);
  if (timer === undefined) return;
  window.clearTimeout(timer);
  pendingRevocations.delete(url);
}

export function scheduleManagedImageUrlRevocation(url: string, delayMilliseconds = 5_000): void {
  if (!managedImageUrls.has(url) || pendingRevocations.has(url)) return;
  const timer = window.setTimeout(() => {
    pendingRevocations.delete(url);
    revokeManagedImageUrl(url);
  }, delayMilliseconds);
  pendingRevocations.set(url, timer);
}

export function imageMimeType(url: string): string | undefined {
  const dataUrlMime = /^data:(image\/[^;,]+)/i.exec(url)?.[1]?.toLowerCase();
  return dataUrlMime || managedImageUrls.get(url);
}

export async function imageUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('تعذر قراءة بيانات الصورة.');
  return response.blob();
}

/**
 * Convert a managed blob URL back to the JSON data-URL shape accepted by the
 * AI Studio preview proxy and our server validation. Uploaded and generated
 * images intentionally stay as blob URLs everywhere else to avoid keeping
 * large Base64 strings in React state.
 */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;

  const blob = await imageUrlToBlob(url);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${blob.type || imageMimeType(url) || 'image/jpeg'};base64,${btoa(binary)}`;
}

export async function toManagedImageUrl(url: string): Promise<string> {
  if (!url.startsWith('data:')) return url;
  return createManagedImageUrl(await imageUrlToBlob(url));
}

export function canvasToManagedImageUrl(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('تعذر تصدير الصورة من Canvas.'));
        return;
      }
      resolve(createManagedImageUrl(blob));
    }, type, quality);
  });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', () => {
    managedImageUrls.forEach((_mimeType, url) => URL.revokeObjectURL(url));
    managedImageUrls.clear();
    pendingRevocations.clear();
  }, { once: true });
}
