import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '../shared/api';
import { runtimeRequiresUserApiKey } from './useRuntimeCredentials';

const MANAGED_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'managed',
  googleOnlyMode: true,
  openaiAvailable: false,
  maxBatchConcurrency: 2,
};

const BYOK_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'byok',
  googleOnlyMode: false,
  openaiAvailable: false,
  maxBatchConcurrency: 2,
};

test('AI Studio managed mode never asks the user for a key', () => {
  assert.equal(runtimeRequiresUserApiKey(MANAGED_CONFIG), false);
});

test('external BYOK mode requires the current user key', () => {
  assert.equal(runtimeRequiresUserApiKey(BYOK_CONFIG), true);
});

test('an unknown runtime is not silently treated as managed', () => {
  assert.equal(runtimeRequiresUserApiKey(null), false);
});
