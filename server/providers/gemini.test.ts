import assert from 'node:assert/strict';
import test from 'node:test';
import { editWithGemini, generateContentConfig } from './gemini';

const TEST_IMAGE = 'data:image/png;base64,aGVsbG8=';

test('Gemini uses generateContent and only sends an explicit non-default size', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: 'cmVzdWx0' } }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const liteResult = await editWithGemini('test-key', {
      originalImage: TEST_IMAGE,
      maskedImage: TEST_IMAGE,
      prompt: 'Improve the image.',
      model: 'gemini-3.1-flash-lite-image',
      appMode: 'reimagine',
      aspectRatio: 'original',
      imageSize: '1K',
      enableOutpainting: false,
      outpaintPreserve2D: true,
      similarityLevel: 'high',
    }, new AbortController().signal);

    const flashResult = await editWithGemini('test-key', {
      originalImage: TEST_IMAGE,
      maskedImage: TEST_IMAGE,
      prompt: 'Improve the image.',
      model: 'gemini-3.1-flash-image',
      appMode: 'reimagine',
      aspectRatio: '16:9',
      imageSize: '2K',
      enableOutpainting: false,
      outpaintPreserve2D: true,
      similarityLevel: 'medium',
    }, new AbortController().signal);

    assert.equal(liteResult, 'data:image/png;base64,cmVzdWx0');
    assert.equal(flashResult, 'data:image/png;base64,cmVzdWx0');
    assert.equal(requests.length, 2);

    assert.match(requests[0].url, /models\/gemini-3\.1-flash-lite-image:generateContent/);
    const liteConfig = requests[0].body.generationConfig as Record<string, unknown>;
    assert.equal(liteConfig.temperature, 0.15);
    assert.equal('imageConfig' in liteConfig, false);

    assert.match(requests[1].url, /models\/gemini-3\.1-flash-image:generateContent/);
    const flashConfig = requests[1].body.generationConfig as Record<string, unknown>;
    assert.equal(flashConfig.temperature, 0.5);
    assert.deepEqual(flashConfig.imageConfig, {
      aspectRatio: '16:9',
      imageSize: '2K',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the original AI Studio request shape for default 1K output', () => {
  const signal = new AbortController().signal;
  const config = generateContentConfig({
    aspectRatio: 'original',
    imageSize: '1K',
    similarityLevel: 'high',
  }, signal);

  assert.equal(config.abortSignal, signal);
  assert.equal(config.temperature, 0.15);
  assert.equal('imageConfig' in config, false);
});

test('adds resolution only when a non-default Flash size is selected', () => {
  const config = generateContentConfig({
    aspectRatio: '16:9',
    imageSize: '2K',
    similarityLevel: 'medium',
  });

  assert.deepEqual(config.imageConfig, {
    aspectRatio: '16:9',
    imageSize: '2K',
  });
  assert.equal(config.temperature, 0.5);
});

test('can request the original ratio at 4K without forcing a new ratio', () => {
  const config = generateContentConfig({
    aspectRatio: 'original',
    imageSize: '4K',
    similarityLevel: 'low',
  });

  assert.deepEqual(config.imageConfig, { imageSize: '4K' });
  assert.equal(config.temperature, 1);
});
