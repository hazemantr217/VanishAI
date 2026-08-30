import assert from 'node:assert/strict';
import test from 'node:test';
import { revokeManagedImageUrl } from './image-urls';
import { filesToBatchItems, MAX_BATCH_IMAGES } from './images';

test('accepts a full 100-image batch without Base64 expansion', async () => {
  const files = Array.from({ length: MAX_BATCH_IMAGES }, (_value, index) => (
    new File([`image-${index}`], `image-${index}.png`, { type: 'image/png' })
  ));
  let nextId = 0;
  const result = await filesToBatchItems(files, () => `image-${nextId++}`);

  assert.equal(result.items.length, MAX_BATCH_IMAGES);
  assert.equal(result.failedFiles.length, 0);
  assert.equal(result.items.every((item) => item.originalImage.startsWith('blob:')), true);

  result.items.forEach((item) => revokeManagedImageUrl(item.originalImage));
});
