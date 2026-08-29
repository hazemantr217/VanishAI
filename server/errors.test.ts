import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccessDeniedError, isAuthenticationError, publicErrorMessage } from './errors';

test('provider 403 errors are reported as paid-tier access failures', () => {
  const error = Object.assign(new Error('Permission denied'), { status: 403 });
  assert.equal(isAuthenticationError(error), false);
  assert.equal(isAccessDeniedError(error), true);
  assert.match(publicErrorMessage(error), /Paid Tier|Billing/);
});
