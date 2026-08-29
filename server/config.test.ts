import assert from 'node:assert/strict';
import test from 'node:test';

test('a managed Gemini runtime stays Google-only even if an OpenAI secret exists', async () => {
  process.env.GEMINI_API_KEY = 'managed-test-key';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  const config = await import('./config');
  assert.equal(config.isGoogleManagedRuntime(), true);
  assert.equal(config.isOpenAIEnabled(), false);
});
