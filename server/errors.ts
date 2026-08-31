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

export function publicErrorMessage(error: unknown, options: { managedGemini?: boolean } = {}): string {
  if (error instanceof ApiError) return error.message;
  if (isAuthenticationError(error)) {
    if (options.managedGemini) {
      return 'رفض Google اتصال Gemini المُدار لهذا المشروع. أعد تشغيل Preview ثم أعد المحاولة.';
    }
    return 'رفض Google مصادقة مفتاح Gemini. حدّث مفتاح AI Studio أو استخدم مفتاحًا صالحًا خارج المنصة.';
  }
  if (isQuotaError(error)) {
    if (options.managedGemini) {
      return 'حصة مشروع AI Studio الحالي غير متاحة الآن. انتظر تجدد الحصة ثم أعد المحاولة.';
    }
    return 'تم تجاوز حصة الاستخدام أو حد سرعة الطلبات. انتظر قليلًا ثم أعد المحاولة.';
  }
  if (isAccessDeniedError(error)) {
    if (options.managedGemini) {
      return 'رفض Google وصول مشروع AI Studio الحالي إلى الموديل المختار.';
    }
    return 'رفض Google الطلب (403). تحقق من صلاحية المفتاح أو قيود مصدره للموديل المختار؛ هذا الخطأ لا يعني الفوترة تلقائيًا.';
  }
  return options.managedGemini
    ? 'فشلت معالجة الصورة عبر اتصال AI Studio المُدار. أعد المحاولة.'
    : 'فشلت معالجة الصورة. تحقق من المفتاح والموديل ثم أعد المحاولة.';
}
