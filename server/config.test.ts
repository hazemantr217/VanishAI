import assert from 'node:assert/strict';
import test from 'node:test';

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
