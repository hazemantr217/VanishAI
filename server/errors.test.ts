import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccessDeniedError, isAuthenticationError, publicErrorMessage } from './errors';

test('provider 403 errors report permission without guessing billing state', () => {
  const error = Object.assign(new Error('Permission denied'), { status: 403 });
  assert.equal(isAuthenticationError(error), false);
  assert.equal(isAccessDeniedError(error), true);
  assert.match(publicErrorMessage(error), /403|صلاحية/);
  assert.doesNotMatch(publicErrorMessage(error), /Paid Tier|Billing/);
});

test('managed AI Studio provider errors never direct the user to an API key', () => {
  const authentication = Object.assign(new Error('API key invalid'), { status: 401 });
  const quota = Object.assign(new Error('RESOURCE_EXHAUSTED quota'), { status: 429 });
  for (const error of [authentication, quota]) {
    const message = publicErrorMessage(error, { managedGemini: true });
    assert.match(message, /AI Studio|المشروع/);
    assert.doesNotMatch(message, /مفتاح|API key/i);
  }
});
