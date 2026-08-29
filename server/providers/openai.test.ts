import assert from 'node:assert/strict';
import test from 'node:test';
import { openAIOutputSize } from './openai';

test('OpenAI size selection respects model capabilities', () => {
  assert.equal(openAIOutputSize({
    model: 'gpt-image-1.5',
    aspectRatio: '16:9',
    imageSize: '4K',
  }), '1536x1024');

  assert.equal(openAIOutputSize({
    model: 'gpt-image-2',
    aspectRatio: '16:9',
    imageSize: '4K',
  }), '3840x2160');

  const square4k = openAIOutputSize({
    model: 'gpt-image-2',
    aspectRatio: '1:1',
    imageSize: '4K',
  });
  const [width, height] = square4k.split('x').map(Number);
  assert.equal(width, height);
  assert.ok(width * height <= 8_294_400);
});
