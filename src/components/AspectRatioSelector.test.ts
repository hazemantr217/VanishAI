import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAspectRatioInput } from './AspectRatioSelector';

test('normalizes typed ratios and accepts common separators', () => {
  assert.equal(normalizeAspectRatioInput(' 6 : 8 '), '3:4');
  assert.equal(normalizeAspectRatioInput('4x3'), '4:3');
  assert.equal(normalizeAspectRatioInput('9/16'), '9:16');
  assert.equal(normalizeAspectRatioInput('0:4'), null);
  assert.equal(normalizeAspectRatioInput('ratio'), null);
});
