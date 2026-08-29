import assert from 'node:assert/strict';
import test from 'node:test';
import { fitImageToContainer, pointerToImagePoint } from './canvas-geometry';

test('responsive canvas transforms preserve image coordinates', () => {
  const first = fitImageToContainer(1000, 800, 2000, 1000);
  const second = fitImageToContainer(700, 800, 2000, 1000);
  const imagePoint = { x: 1234, y: 456 };

  const firstPointer = {
    x: first.x + imagePoint.x * first.scale,
    y: first.y + imagePoint.y * first.scale,
  };
  const secondPointer = {
    x: second.x + imagePoint.x * second.scale,
    y: second.y + imagePoint.y * second.scale,
  };

  for (const actual of [
    pointerToImagePoint(firstPointer, first, 2000, 1000),
    pointerToImagePoint(secondPointer, second, 2000, 1000),
  ]) {
    assert.ok(Math.abs(actual.x - imagePoint.x) < 0.000001);
    assert.ok(Math.abs(actual.y - imagePoint.y) < 0.000001);
  }
});

test('pointer coordinates are clamped inside the source bitmap', () => {
  assert.deepEqual(
    pointerToImagePoint({ x: -100, y: 900 }, { x: 0, y: 0, scale: 1 }, 400, 300),
    { x: 0, y: 299 },
  );
});
