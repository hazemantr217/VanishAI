import assert from 'node:assert/strict';
import test from 'node:test';
import { processingErrorMessage } from './processing-errors';

test('managed AI Studio quota errors never ask for another API key', () => {
  const error = new Error('تم تجاوز حصة الاستخدام أو حد سرعة الطلبات.');
  error.name = 'QUOTA_EXCEEDED';
  const message = processingErrorMessage(error, { managedGemini: true });
  assert.match(message, /مشروع AI Studio/);
  assert.doesNotMatch(message, /مفتاحًا آخر|إدخال مفتاح/);
});

test('internal rate limiting is not mislabeled as Google quota', () => {
  const error = new Error('طلبات كثيرة جدًا من هذا الجهاز.');
  error.name = 'RATE_LIMITED';
  const message = processingErrorMessage(error, { managedGemini: true });
  assert.match(message, /كثرة المحاولات من التطبيق/);
  assert.doesNotMatch(message, /حصة Google/);
});
