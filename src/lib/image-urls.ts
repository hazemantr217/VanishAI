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
