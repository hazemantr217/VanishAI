import assert from 'node:assert/strict';
import test from 'node:test';
import type { Preset } from '../types';

function reorderPresetsArray(presets: Preset[], sourceIndex: number, targetIndex: number): Preset[] {
  if (sourceIndex === targetIndex) return presets;
  if (
    sourceIndex < 0 ||
    sourceIndex >= presets.length ||
    targetIndex < 0 ||
    targetIndex >= presets.length
  ) {
    return presets;
  }
  const updated = [...presets];
  const [movedItem] = updated.splice(sourceIndex, 1);
  updated.splice(targetIndex, 0, movedItem);
  return updated;
}

test('reorders presets from one index to another correctly', () => {
  const initial: Preset[] = [
    { name: 'A', prompt: 'Prompt A' },
    { name: 'B', prompt: 'Prompt B' },
    { name: 'C', prompt: 'Prompt C' },
    { name: 'D', prompt: 'Prompt D' },
  ];

  const reordered = reorderPresetsArray(initial, 0, 2);
  assert.deepEqual(
    reordered.map((p) => p.name),
    ['B', 'C', 'A', 'D']
  );

  const reorderedBack = reorderPresetsArray(reordered, 3, 0);
  assert.deepEqual(
    reorderedBack.map((p) => p.name),
    ['D', 'B', 'C', 'A']
  );
});

test('reordering to the same index or invalid index leaves array unchanged', () => {
  const initial: Preset[] = [
    { name: 'A', prompt: 'Prompt A' },
    { name: 'B', prompt: 'Prompt B' },
  ];

  assert.deepEqual(reorderPresetsArray(initial, 0, 0), initial);
  assert.deepEqual(reorderPresetsArray(initial, -1, 1), initial);
  assert.deepEqual(reorderPresetsArray(initial, 0, 5), initial);
});
