import assert from 'node:assert/strict';
import test from 'node:test';
import { mapWithConcurrency } from './concurrency';

test('mapWithConcurrency preserves order and enforces the limit', async () => {
  let active = 0;
  let peak = 0;
  const values = [1, 2, 3, 4, 5];

  const results = await mapWithConcurrency(values, 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 10;
  });

  assert.equal(peak, 2);
  assert.deepEqual(
    results.map((result) => result.status === 'fulfilled' ? result.value : null),
    [10, 20, 30, 40, 50],
  );
});

test('mapWithConcurrency contains individual failures', async () => {
  const results = await mapWithConcurrency([1, 2, 3], 3, async (value) => {
    if (value === 2) throw new Error('expected');
    return value;
  });

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].status, 'fulfilled');
});

test('can start a full 100-image batch without a fixed two-item cap', async () => {
  const values = Array.from({ length: 100 }, (_value, index) => index);
  let started = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const processing = mapWithConcurrency(values, values.length, async (value) => {
    started += 1;
    await gate;
    return value;
  });

  while (started < values.length) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(started, 100);
  release();

  const results = await processing;
  assert.equal(results.length, 100);
  assert.equal(results.every((result) => result.status === 'fulfilled'), true);
});
