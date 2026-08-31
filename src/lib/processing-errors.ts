function errorCode(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

export function processingErrorMessage(
  error: unknown,
  options: { merge?: boolean; managedGemini?: boolean } = {},
): string {
  const fallback = options.merge ? 'حدث خطأ أثناء دمج الصور' : 'حدث خطأ أثناء معالجة الصورة';
  const message = error instanceof Error ? error.message : fallback;
  const code = errorCode(error);
  const serialized = `${code} ${message} ${
    typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error)
  }`.toLowerCase();

  if (code === 'RATE_LIMITED') {
    return 'تم إيقاف الطلب مؤقتًا بسبب كثرة المحاولات من التطبيق. انتظر قليلًا ثم أعد المحاولة.';
  }

  const quotaError = ['429', 'quota', 'resource_exhausted', 'exceeded'].some((token) => serialized.includes(token));
  if (!quotaError) return message;

  if (options.managedGemini) {
    return 'وصل الطلب إلى Google، لكن حصة مشروع AI Studio المرتبط بهذه النسخة غير متاحة الآن. انتظر تجدد حصة هذا المشروع ثم أعد المحاولة.';
  }

  return 'تجاوزت حصة Google المتاحة للمفتاح المستخدم. انتظر تجدد الحصة أو استخدم مفتاحًا آخر.';
}
