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
  return /(?:403|permission.?denied|access.?denied|billing|paid tier|not available.*free tier)/i.test(value);
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isAuthenticationError(error)) {
    return 'مفتاح API غير صالح أو غير مصرح له باستخدام الموديل.';
  }
  if (isAccessDeniedError(error)) {
    return 'فشل الطلب (403): يتطلب توليد الصور عبر Gemini تفعيل الفوترة أو ربط مفتاح مشروع مدفوع لموديلات الصور.';
  }
  if (isQuotaError(error)) {
    return 'تم تجاوز حصة الاستخدام أو حد سرعة الطلبات. يرجى الانتظار قليلاً ثم إعادة المحاولة.';
  }
  return 'فشلت معالجة الصورة. يرجى التحقق من المدخلات ثم إعادة المحاولة.';
}
