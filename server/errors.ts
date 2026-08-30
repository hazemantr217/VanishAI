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
  // Do not match quota errors as 403
  if (isQuotaError(error)) return false;
  return /(?:permission.?denied|access.?denied|api key.*referrer)/i.test(value);
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isAuthenticationError(error)) {
    return 'رفض Google مصادقة مفتاح Gemini. يرجى التحقق من صحة المفتاح.';
  }
  if (isQuotaError(error)) {
    return 'تتطلب موديلات توليد وتعديل الصور تفعيل الفوترة (Pay-as-you-go) أو ربط مشروع مفعل في AI Studio لتوفير الحصة.';
  }
  if (isAccessDeniedError(error)) {
    return 'تم رفض الطلب (403). يرجى التحقق من صلاحيات المفتاح والمشروع.';
  }
  return 'فشلت معالجة الصورة. تحقق من المفتاح والموديل ثم أعد المحاولة.';
}
