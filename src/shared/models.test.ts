import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isGeminiModel,
  isOpenAIModel,
  isSupportedAspectRatio,
  supportsImageSize,
  SUPPORTED_ASPECT_RATIOS,
} from './models';

test('model guards accept only configured models', () => {
  assert.equal(isGeminiModel('gemini-3.1-flash-image'), true);
  assert.equal(isGeminiModel('gemini-unknown'), false);
  assert.equal(isOpenAIModel('gpt-image-1.5'), true);
  assert.equal(isOpenAIModel('gpt-4o'), false);
});

test('all advertised aspect ratios pass validation', () => {
  for (const ratio of SUPPORTED_ASPECT_RATIOS) {
    assert.equal(isSupportedAspectRatio(ratio), true);
  }
  assert.equal(isSupportedAspectRatio('5:7'), false);
});

test('image-size capabilities match each provider model', () => {
  assert.equal(supportsImageSize('gemini-3.1-flash-lite-image', '1K'), true);
  assert.equal(supportsImageSize('gemini-3.1-flash-lite-image', '2K'), false);
  assert.equal(supportsImageSize('gemini-3.1-flash-image', '4K'), true);
  assert.equal(supportsImageSize('gpt-image-1.5', '2K'), false);
  assert.equal(supportsImageSize('gpt-image-2', '4K'), true);
});
