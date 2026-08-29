import assert from 'node:assert/strict';
import test from 'node:test';
import { imageInteractionRequest, imageResponseFormat } from './gemini';

test('uses only the current Interactions image response schema', () => {
  const request = imageInteractionRequest(
    'gemini-3.1-flash-image',
    [{ type: 'text', text: 'Generate an image.' }],
    { aspectRatio: '16:9', imageSize: '2K' },
  );

  assert.deepEqual(request.response_format, {
    type: 'image',
    mime_type: 'image/png',
    aspect_ratio: '16:9',
    image_size: '2K',
  });
  assert.equal('response_modalities' in request, false);
  assert.equal('store' in request, false);
  assert.equal('stream' in request, false);
});

test('lets Gemini preserve the input aspect ratio when original is selected', () => {
  assert.deepEqual(imageResponseFormat({ aspectRatio: 'original', imageSize: '1K' }), {
    type: 'image',
    mime_type: 'image/png',
    image_size: '1K',
  });
});
