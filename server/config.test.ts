import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request } from 'express';

test('a managed Gemini runtime stays Google-only even if an OpenAI secret exists', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'managed-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const config = await import('./config');
    assert.equal(config.isGoogleManagedRuntime(), true);
    assert.equal(config.isOpenAIEnabled(), false);
  } finally {
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAIKey;
  }
});

test('managed Gemini secrets are read dynamically after preview startup', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  try {
    const config = await import('./config');
    delete process.env.GEMINI_API_KEY;
    assert.equal(config.serverConfig.managedGeminiApiKey, null);

    process.env.GEMINI_API_KEY = 'refreshed-ai-studio-key';
    assert.equal(config.serverConfig.managedGeminiApiKey, 'refreshed-ai-studio-key');
    assert.equal(config.isGoogleManagedRuntime(), true);
  } finally {
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
  }
});

test('AI Studio managed credentials take priority over stale browser credentials', async () => {
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'managed-ai-studio-key';
    const config = await import('./config');
    const request = {
      header(name: string) {
        return name === 'x-gemini-api-key' ? 'stale-browser-key' : undefined;
      },
    } as unknown as Request;

    assert.equal(config.resolveGeminiApiKey(request), 'managed-ai-studio-key');
  } finally {
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
  }
});
