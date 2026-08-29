import assert from 'node:assert/strict';
import test from 'node:test';
import type { BatchItem } from '../types';
import { acceptItemResult, redoItem, undoItem } from './items';
import { MAX_EDIT_HISTORY } from './items';

function makeItem(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: 'item',
    initialImage: 'initial',
    originalImage: 'current',
    editHistory: ['previous'],
    maskedImage: 'masked',
    resultImage: 'generated',
    status: 'completed',
    ...overrides,
  };
}

test('accept, undo, and redo preserve one coherent history', () => {
  const accepted = acceptItemResult(makeItem());
  assert.equal(accepted.originalImage, 'generated');
  assert.deepEqual(accepted.editHistory, ['previous', 'current']);
  assert.equal(accepted.resultImage, null);

  const undone = undoItem(accepted);
  assert.equal(undone.originalImage, 'current');
  assert.deepEqual(undone.editHistory, ['previous']);
  assert.deepEqual(undone.redoEditHistory, ['generated']);

  const redone = redoItem(undone);
  assert.equal(redone.originalImage, 'generated');
  assert.deepEqual(redone.editHistory, ['previous', 'current']);
});

test('undo discards an unaccepted generated result before changing history', () => {
  const undone = undoItem(makeItem());
  assert.equal(undone.originalImage, 'current');
  assert.deepEqual(undone.editHistory, ['previous']);
  assert.equal(undone.resultImage, null);
});

test('edit history is bounded to avoid retaining unlimited image blobs', () => {
  const item = makeItem({
    originalImage: 'current',
    resultImage: 'next',
    editHistory: Array.from({ length: MAX_EDIT_HISTORY }, (_, index) => `old-${index}`),
  });
  const accepted = acceptItemResult(item);
  assert.equal(accepted.editHistory.length, MAX_EDIT_HISTORY);
  assert.equal(accepted.editHistory.at(-1), 'current');
  assert.equal(accepted.editHistory.includes('old-0'), false);
});
