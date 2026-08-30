import assert from 'node:assert/strict';
import test from 'node:test';
import { editWithGemini, generateContentConfig } from './gemini';

const TEST_IMAGE = 'data:image/png;base64,aGVsbG8=';

test('Gemini restores the original AI Studio generateContent request shape', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
      headers: new Headers(init?.headers),
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
    assert.equal(requests[0].headers.get('user-agent'), 'aistudio-build');
    const liteConfig = requests[0].body.generationConfig as Record<string, unknown>;
    assert.equal(liteConfig.temperature, 0.15);
    assert.equal('imageConfig' in liteConfig, false);

    assert.match(requests[1].url, /models\/gemini-3\.1-flash-image:generateContent/);
    const flashConfig = requests[1].body.generationConfig as Record<string, unknown>;
    assert.equal(flashConfig.temperature, 0.5);
    assert.deepEqual(flashConfig.imageConfig, {
      aspectRatio: '16:9',
    });
    const flashParts = ((requests[1].body.contents as Array<{ parts: unknown[] }>)[0]).parts;
    assert.equal(flashParts.length, 2, 'one image plus one prompt should be sent');
    assert.equal(JSON.stringify(requests[1].body).includes('imageSize'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps the original AI Studio request shape for native output', () => {
  const signal = new AbortController().signal;
  const config = generateContentConfig({
    aspectRatio: 'original',
    similarityLevel: 'high',
  }, signal);

  assert.equal(config.abortSignal, signal);
  assert.equal(config.temperature, 0.15);
  assert.equal('imageConfig' in config, false);
});

test('adds only an aspect ratio when one is selected', () => {
  const config = generateContentConfig({
    aspectRatio: '16:9',
    similarityLevel: 'medium',
  });

  assert.deepEqual(config.imageConfig, {
    aspectRatio: '16:9',
  });
  assert.equal(config.temperature, 0.5);
});

test('does not create imageConfig when the original ratio is selected', () => {
  const config = generateContentConfig({
    aspectRatio: 'original',
    similarityLevel: 'low',
  });

  assert.equal('imageConfig' in config, false);
  assert.equal(config.temperature, 1);
});
