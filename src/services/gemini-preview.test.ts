import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseAIStudioPreviewGemini, editWithAIStudioPreview } from './gemini-preview';

const TEST_IMAGE = 'data:image/png;base64,aGVsbG8=';

test('uses the injected key only inside AI Studio Preview', () => {
  assert.equal(canUseAIStudioPreviewGemini(true, 'preview-key'), true);
  assert.equal(canUseAIStudioPreviewGemini(false, 'preview-key'), false);
  assert.equal(canUseAIStudioPreviewGemini(true, ''), false);
});

test('AI Studio Preview matches the Stable generateContent request shape', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  let capturedBody: Record<string, unknown> | undefined;
  process.env.GEMINI_API_KEY = 'preview-test-key';
  globalThis.fetch = async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'cmVzdWx0' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await editWithAIStudioPreview({
      originalImage: TEST_IMAGE,
      maskedImage: TEST_IMAGE,
      prompt: 'Improve the image',
      model: 'gemini-3.1-flash-lite-image',
      appMode: 'reimagine',
      aspectRatio: 'original',
      imageSize: '1K',
      similarityLevel: 'high',
    });
    assert.equal(result, 'data:image/png;base64,cmVzdWx0');
    const contents = capturedBody?.contents as Array<{ parts: unknown[] }>;
    assert.equal(contents[0].parts.length, 2, 'one image and one prompt are sent');
    assert.equal(JSON.stringify(capturedBody).includes('imageSize'), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
});
