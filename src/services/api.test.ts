import assert from 'node:assert/strict';
import test from 'node:test';
import { requestInpaint } from './api';

const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

test('Gemini converts managed blob images to the original JSON data-URL transport', async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  const uploadedImage = URL.createObjectURL(new Blob(['uploaded-image'], { type: 'image/png' }));

  globalThis.fetch = async (input, init) => {
    if (String(input) === '/api/inpaint') {
      capturedInit = init;
      return new Response(JSON.stringify({
        resultImage: TEST_IMAGE,
        requestId: 'test-request',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
  };

  try {
    const response = await requestInpaint({
      originalImage: uploadedImage,
      maskedImage: uploadedImage,
      prompt: 'Improve it',
      model: 'gemini-3.1-flash-image',
      appMode: 'reimagine',
      aspectRatio: 'original',
      imageSize: '4K',
      similarityLevel: 'high',
    });

    assert.ok(response.resultImage.startsWith('blob:'));
    assert.equal(capturedInit?.method, 'POST');
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.has('x-vanish-request'), false);
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>;
    assert.equal(body.model, 'gemini-3.1-flash-image');
    assert.equal('imageSize' in body, false);
    assert.match(String(body.maskedImage), /^data:image\/png;base64,/);
    assert.equal('originalImage' in body, false, 'Gemini should not duplicate the image payload');
    assert.equal('dalleMaskImage' in body, false, 'Gemini does not consume the OpenAI mask');
  } finally {
    URL.revokeObjectURL(uploadedImage);
    globalThis.fetch = originalFetch;
  }
});
