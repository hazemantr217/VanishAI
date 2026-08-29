export interface Point {
  x: number;
  y: number;
}

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export function fitImageToContainer(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  fill = 0.9,
): CanvasTransform {
  const safeImageWidth = Math.max(1, imageWidth);
  const safeImageHeight = Math.max(1, imageHeight);
  const scale = Math.max(0.0001, Math.min(
    containerWidth / safeImageWidth,
    containerHeight / safeImageHeight,
  ) * fill);
  return {
    scale,
    x: (containerWidth - safeImageWidth * scale) / 2,
    y: (containerHeight - safeImageHeight * scale) / 2,
  };
}

export function pointerToImagePoint(
  pointer: Point,
  transform: CanvasTransform,
  imageWidth: number,
  imageHeight: number,
): Point {
  const x = (pointer.x - transform.x) / transform.scale;
  const y = (pointer.y - transform.y) / transform.scale;
  return {
    x: Math.max(0, Math.min(Math.max(0, imageWidth - 1), x)),
    y: Math.max(0, Math.min(Math.max(0, imageHeight - 1), y)),
  };
}
