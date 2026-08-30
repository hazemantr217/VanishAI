export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'ABORTED')
  );
}

export function isQuotaError(error: unknown): boolean {
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /(?:429|resource_exhausted|quota|rate.?limit|too many requests)/i.test(value);
}

export function isAuthenticationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const status = 'status' in error ? Number(error.status) : 0;
    if (status === 401) return true;
  }
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /(?:invalid api key|api.?key.?invalid|unauthenticated|authentication failed)/i.test(value);
}

export function isAccessDeniedError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const status = 'status' in error ? Number(error.status) : 0;
    if (status === 403) return true;
  }
  const value = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /(?:permission.?denied|access.?denied|billing|paid tier|not available.*free tier)/i.test(value);
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isAuthenticationError(error)) {
    return 'مفتاح API غير صالح أو لا يملك صلاحية استخدام الموديل المختار.';
  }
  if (isAccessDeniedError(error)) {
    return 'رفض Google الطلب (403). تحقق من صلاحية المفتاح لاستخدام الموديل المختار ثم أعد المحاولة.';
  }
  if (isQuotaError(error)) {
    return 'تم تجاوز حصة الاستخدام أو حد سرعة الطلبات. جرّب لاحقًا أو استخدم مفتاحًا له حصة متاحة.';
  }
  return 'فشلت معالجة الصورة. تحقق من المفتاح والموديل ثم أعد المحاولة.';
}
