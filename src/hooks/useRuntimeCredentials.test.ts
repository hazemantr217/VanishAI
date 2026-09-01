import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeConfig } from '../shared/api';
import { runtimeRequiresUserApiKey } from './useRuntimeCredentials';

const MANAGED_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'managed',
  googleOnlyMode: true,
  openaiAvailable: false,
};

const BYOK_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'byok',
  googleOnlyMode: false,
  openaiAvailable: false,
};

test('AI Studio managed mode never asks the user for a key', () => {
  assert.equal(runtimeRequiresUserApiKey(MANAGED_CONFIG), false);
});

test('external BYOK mode requires the current user key', () => {
  assert.equal(runtimeRequiresUserApiKey(BYOK_CONFIG), true);
});

test('AI Studio host overrides a stale BYOK response and never asks for a key', () => {
  assert.equal(runtimeRequiresUserApiKey(BYOK_CONFIG, true), false);
});

test('an unknown runtime is not silently treated as managed', () => {
  assert.equal(runtimeRequiresUserApiKey(null), false);
});
