/// <reference lib="webworker" />

interface FloodFillRequest {
  id: string;
  pixels: ArrayBuffer;
  width: number;
  height: number;
  startX: number;
  startY: number;
  tolerance: number;
  fillColor: [number, number, number];
}

interface FloodFillResponse {
  id: string;
  mask: ArrayBuffer;
}

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function colorDistanceSquared(
  pixels: Uint8ClampedArray,
  pixelIndex: number,
  red: number,
  green: number,
  blue: number,
): number {
  const offset = pixelIndex * 4;
  const redDelta = pixels[offset] - red;
  const greenDelta = pixels[offset + 1] - green;
  const blueDelta = pixels[offset + 2] - blue;
  return redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
}

workerScope.onmessage = (event: MessageEvent<FloodFillRequest>) => {
  const { id, pixels: buffer, width, height, startX, startY, tolerance, fillColor } = event.data;
  const pixels = new Uint8ClampedArray(buffer);
  const mask = new Uint8ClampedArray(width * height * 4);
  const visited = new Uint8Array(width * height);
  const startIndex = startY * width + startX;
  const startOffset = startIndex * 4;
  const targetRed = pixels[startOffset];
  const targetGreen = pixels[startOffset + 1];
  const targetBlue = pixels[startOffset + 2];
  const toleranceSquared = tolerance * tolerance;
  const stack: number[] = [startIndex];

  const matches = (pixelIndex: number) =>
    !visited[pixelIndex] &&
    colorDistanceSquared(pixels, pixelIndex, targetRed, targetGreen, targetBlue) <= toleranceSquared;

  while (stack.length > 0) {
    const seed = stack.pop()!;
    const y = Math.floor(seed / width);
    let x = seed % width;

    while (x > 0 && matches(y * width + x - 1)) x -= 1;

    let spanAbove = false;
    let spanBelow = false;
    for (; x < width; x += 1) {
      const pixelIndex = y * width + x;
      if (!matches(pixelIndex)) break;

      visited[pixelIndex] = 1;
      const outputOffset = pixelIndex * 4;
      mask[outputOffset] = fillColor[0];
      mask[outputOffset + 1] = fillColor[1];
      mask[outputOffset + 2] = fillColor[2];
      mask[outputOffset + 3] = 230;

      if (y > 0) {
        const above = pixelIndex - width;
        if (matches(above)) {
          if (!spanAbove) stack.push(above);
          spanAbove = true;
        } else {
          spanAbove = false;
        }
      }

      if (y < height - 1) {
        const below = pixelIndex + width;
        if (matches(below)) {
          if (!spanBelow) stack.push(below);
          spanBelow = true;
        } else {
          spanBelow = false;
        }
      }
    }
  }

  const response: FloodFillResponse = { id, mask: mask.buffer };
  workerScope.postMessage(response, [response.mask]);
};

export {};
