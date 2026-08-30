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
