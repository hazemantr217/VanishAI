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
  assert.equal(result.items[0]?.fileName, 'image-0.png');
  assert.equal(result.items[99]?.fileName, 'image-99.png');

  result.items.forEach((item) => revokeManagedImageUrl(item.originalImage));
});

test('preserves original upload names on batch items', async () => {
  const files = [
    new File(['a'], 'customer-front.webp', { type: 'image/webp' }),
    new File(['b'], 'customer-back.jpg', { type: 'image/jpeg' }),
  ];
  let nextId = 0;
  const result = await filesToBatchItems(files, () => `id-${nextId++}`);

  assert.deepEqual(result.items.map((item) => item.fileName), [
    'customer-front.webp',
    'customer-back.jpg',
  ]);

  result.items.forEach((item) => revokeManagedImageUrl(item.originalImage));
});
