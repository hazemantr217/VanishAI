import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Group } from 'react-konva';
import Konva from 'konva';
import { cn } from '../lib/utils';
import { fitImageToContainer, pointerToImagePoint } from '../lib/canvas-geometry';
import { canvasToManagedImageUrl, revokeManagedImageUrl } from '../lib/image-urls';

interface CanvasWorkspaceProps {
  itemId: string | null;
  imageUrl: string | null;
  tool: 'brush' | 'eraser' | 'pan' | 'rect' | 'wand';
  brushSize: number;
  brushHardness: number;
  wandTolerance?: number;
  maskColor: string;
  initialMaskUrl?: string | null;
  onMaskChange: (dataUrl: string, dalleMaskUrl?: string, maskOverlayUrl?: string) => void;
  clearTrigger: number;
}

interface LineMaskShape {
  type: 'line';
  tool: 'brush' | 'eraser';
  points: number[];
  size: number;
  hardness: number;
}

interface RectMaskShape {
  type: 'rect';
  tool: 'rect';
  points: number[];
}

interface BitmapMaskShape {
  type: 'wand_mask';
  image: HTMLImageElement;
}

interface PersistedBitmapMaskShape {
  type: 'bitmap_mask';
  image: HTMLImageElement;
}

type MaskShape = LineMaskShape | RectMaskShape | BitmapMaskShape | PersistedBitmapMaskShape;

function hexToRgb(value: string): [number, number, number] {
  const hex = value.replace('#', '').padEnd(6, '0');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تعذر تحميل القناع.'));
    image.src = url;
  });
}

async function performFloodFill(
  imageElement: HTMLImageElement,
  startX: number,
  startY: number,
  tolerance: number,
  fillColorHex: string
): Promise<HTMLImageElement | null> {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth || imageElement.width;
  const h = imageElement.naturalHeight || imageElement.height;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(imageElement, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const startXInt = Math.round(startX);
  const startYInt = Math.round(startY);
  if (startXInt < 0 || startXInt >= w || startYInt < 0 || startYInt >= h) return null;

  const worker = new Worker(new URL('../workers/magicWand.worker.ts', import.meta.url), { type: 'module' });
  const id = crypto.randomUUID();
  try {
    const maskBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ id: string; mask: ArrayBuffer }>) => {
        if (event.data.id === id) resolve(event.data.mask);
      };
      worker.onerror = () => reject(new Error('تعذر تشغيل أداة التحديد الذكي.'));
      worker.postMessage({
        id,
        pixels: imgData.data.buffer,
        width: w,
        height: h,
        startX: startXInt,
        startY: startYInt,
        tolerance,
        fillColor: hexToRgb(fillColorHex),
      }, [imgData.data.buffer]);
    });
    const maskPixels = new ImageData(new Uint8ClampedArray(maskBuffer), w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.putImageData(maskPixels, 0, 0);
    return await loadHtmlImage(await canvasToManagedImageUrl(canvas));
  } finally {
    worker.terminate();
  }
}

function CanvasWorkspace({
  itemId,
  imageUrl,
  tool,
  brushSize,
  brushHardness,
  wandTolerance = 30,
  maskColor,
  initialMaskUrl,
  onMaskChange,
  clearTrigger,
}: CanvasWorkspaceProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    
    img.onload = () => {
      setImage(img);
    };
    img.onerror = (err) => {
      console.error("Canvas image loading failed:", err);
    };
    img.src = imageUrl;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const cursorLayerRef = useRef<Konva.Layer | null>(null);
  const cursorGroupRef = useRef<Konva.Group | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const [lines, setLines] = useState<MaskShape[]>([]);
  const linesRef = useRef<MaskShape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [isWandProcessing, setIsWandProcessing] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const [initialScale, setInitialScale] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [mouseInStage, setMouseInStage] = useState(false);
  const fittedItemRef = useRef<string | null>(null);
  const previousDimensionsRef = useRef({ width: 0, height: 0 });
  const stageScaleRef = useRef(1);
  const initialScaleRef = useRef(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const updateSize = () => {
      setDimensions({
        width: container.clientWidth,
        height: container.clientHeight
      });
    };
    
    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(container);
    
    return () => {
      observer.disconnect();
    };
  }, []);
  
  useEffect(() => {
    stageScaleRef.current = stageScale;
  }, [stageScale]);

  useEffect(() => {
    initialScaleRef.current = initialScale;
  }, [initialScale]);

  const actualBrushSize = stageScale > 0 ? brushSize / stageScale : brushSize;

  const [history, setHistory] = useState<MaskShape[][]>([[]]);
  const historyRef = useRef<MaskShape[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);
  const historyStepRef = useRef(0);
  const onMaskChangeRef = useRef(onMaskChange);
  const previousClearTriggerRef = useRef(clearTrigger);
  const exportSequenceRef = useRef(0);

  useEffect(() => {
    onMaskChangeRef.current = onMaskChange;
  }, [onMaskChange]);

  const setCurrentLines = (nextLines: MaskShape[]) => {
    linesRef.current = nextLines;
    setLines(nextLines);
  };

  const setCurrentHistory = (nextHistory: MaskShape[][], nextStep: number) => {
    historyRef.current = nextHistory;
    historyStepRef.current = nextStep;
    setHistory(nextHistory);
    setHistoryStep(nextStep);
  };

  const commitShapes = (nextLines: MaskShape[]) => {
    setCurrentLines(nextLines);
    const nextHistory = historyRef.current.slice(0, historyStepRef.current + 1);
    nextHistory.push(nextLines);
    setCurrentHistory(nextHistory, nextHistory.length - 1);
    void exportMask(nextLines);
  };

  useEffect(() => {
    let cancelled = false;
    fittedItemRef.current = null;
    setCurrentLines([]);
    setCurrentHistory([[]], 0);

    if (initialMaskUrl) {
      void loadHtmlImage(initialMaskUrl).then((maskImage) => {
        if (cancelled) return;
        const restored: MaskShape[] = [{ type: 'bitmap_mask', image: maskImage }];
        setCurrentLines(restored);
        setCurrentHistory([[], restored], 1);
      }).catch((error) => console.error('Unable to restore mask:', error));
    }

    return () => {
      cancelled = true;
    };
  }, [itemId, imageUrl]);

  useEffect(() => {
    if (clearTrigger !== previousClearTriggerRef.current) {
      previousClearTriggerRef.current = clearTrigger;
      setCurrentLines([]);
      setCurrentHistory([[]], 0);
      onMaskChangeRef.current('', '', '');
    }
  }, [clearTrigger]);

  useEffect(() => {
    if (!image || dimensions.width <= 0 || dimensions.height <= 0 || isDrawingRef.current) return;
    const imgWidth = image.naturalWidth || image.width || 800;
    const imgHeight = image.naturalHeight || image.height || 600;
    const nextFit = fitImageToContainer(dimensions.width, dimensions.height, imgWidth, imgHeight);
    const previousDimensions = previousDimensionsRef.current;
    const firstFitForItem = fittedItemRef.current !== itemId || previousDimensions.width === 0;
    const isAtFitScale = Math.abs(stageScaleRef.current - initialScaleRef.current) < 0.0001;

    if (firstFitForItem || isAtFitScale) {
      fittedItemRef.current = itemId;
      setInitialScale(nextFit.scale);
      setStageScale(nextFit.scale);
      setStageX(nextFit.x);
      setStageY(nextFit.y);
    } else {
      setInitialScale(nextFit.scale);
      setStageX((x) => x + (dimensions.width - previousDimensions.width) / 2);
      setStageY((y) => y + (dimensions.height - previousDimensions.height) / 2);
    }
    previousDimensionsRef.current = dimensions;
  }, [image, itemId, dimensions, isDrawing]);

  const stagePointerInImage = (stage: Konva.Stage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const imgWidth = image ? (image.naturalWidth || image.width || 800) : 800;
    const imgHeight = image ? (image.naturalHeight || image.height || 600) : 600;
    return pointerToImagePoint(pointer, {
      x: stage.x(),
      y: stage.y(),
      scale: stage.scaleX() || 1,
    }, imgWidth, imgHeight);
  };

  const handleMouseDown = async (e: any) => {
    if (tool === 'pan' || isSpacePressed || e.evt.button === 1 || e.evt.button === 2) {
      if (e.evt.button === 1) {
        const stage = e.target.getStage();
        stage.draggable(true);
        stage.startDrag();
      }
      return;
    }
    
    const pos = stagePointerInImage(e.target.getStage());
    if (!pos) return;
    const clampedX = pos.x;
    const clampedY = pos.y;

    if (tool === 'wand') {
      if (!image || isWandProcessing) return;
      setIsWandProcessing(true);
      try {
        const maskImg = await performFloodFill(image, clampedX, clampedY, wandTolerance, maskColor);
        if (maskImg) {
          commitShapes([...linesRef.current, { type: 'wand_mask', image: maskImg }]);
        }
      } catch (error) {
        console.error('Magic Wand failed:', error);
      } finally {
        setIsWandProcessing(false);
      }
      return;
    }

    isDrawingRef.current = true;
    setIsDrawing(true);
    if (tool === 'rect') {
      setCurrentLines([...linesRef.current, { type: 'rect', tool, points: [clampedX, clampedY, clampedX, clampedY] }]);
    } else {
      setCurrentLines([...linesRef.current, { type: 'line', tool, points: [clampedX, clampedY, clampedX, clampedY], size: actualBrushSize, hardness: brushHardness }]);
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stagePointerInImage(stage);
    if (!point) return;

    if (cursorGroupRef.current && cursorLayerRef.current) {
      cursorGroupRef.current.position(point);
      cursorLayerRef.current.batchDraw();
    }

    if (!isDrawing || tool === 'pan' || isSpacePressed || tool === 'wand') return;

    const currentLines = linesRef.current;
    const lastLine = currentLines[currentLines.length - 1];
    if (!lastLine || lastLine.type === 'wand_mask' || lastLine.type === 'bitmap_mask') return;
    
    const clampedX = point.x;
    const clampedY = point.y;

    const updatedShape: MaskShape = lastLine.type === 'rect'
      ? { ...lastLine, points: [lastLine.points[0], lastLine.points[1], clampedX, clampedY] }
      : { ...lastLine, points: [...lastLine.points, clampedX, clampedY] };
    setCurrentLines([...currentLines.slice(0, -1), updatedShape]);
  };

  const handleMouseUp = (e: any) => {
    if (e.evt.button === 1) {
       const stage = e.target.getStage();
       stage.draggable(tool === 'pan' || isSpacePressed);
    }
    if (tool === 'pan' || isSpacePressed || e.evt.button === 1 || e.evt.button === 2 || tool === 'wand') return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    
    commitShapes(linesRef.current);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    
    if (newScale <= initialScale) {
       newScale = initialScale;
       setStageScale(newScale);
       const imgWidth = image ? (image.naturalWidth || image.width || 800) : 800;
       const imgHeight = image ? (image.naturalHeight || image.height || 600) : 600;
       setStageX((dimensions.width - imgWidth * newScale) / 2);
       setStageY((dimensions.height - imgHeight * newScale) / 2);
       return;
    }

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    setStageScale(newScale);
    setStageX(pointer.x - mousePointTo.x * newScale);
    setStageY(pointer.y - mousePointTo.y * newScale);
  };

  async function exportMask(shapes: MaskShape[]) {
    const exportSequence = ++exportSequenceRef.current;
    if (!image) return;
    if (shapes.length === 0) {
      onMaskChangeRef.current('', '', '');
      return;
    }

    const exportWidth = image.naturalWidth || image.width || 800;
    const exportHeight = image.naturalHeight || image.height || 600;
    const overlayStage = new Konva.Stage({
      container: document.createElement('div'),
      width: exportWidth,
      height: exportHeight,
    });
    const overlayLayer = new Konva.Layer();
    overlayStage.add(overlayLayer);

    shapes.forEach((shape) => {
      if (shape.type === 'wand_mask' || shape.type === 'bitmap_mask') {
        overlayLayer.add(new Konva.Image({
          image: shape.image,
          width: exportWidth,
          height: exportHeight,
          globalCompositeOperation: 'source-over',
        }));
      } else if (shape.type === 'rect') {
        overlayLayer.add(new Konva.Rect({
          x: Math.min(shape.points[0], shape.points[2]),
          y: Math.min(shape.points[1], shape.points[3]),
          width: Math.abs(shape.points[2] - shape.points[0]),
          height: Math.abs(shape.points[3] - shape.points[1]),
          fill: maskColor,
          globalCompositeOperation: 'source-over',
        }));
      } else {
        overlayLayer.add(new Konva.Line({
          points: shape.points,
          stroke: maskColor,
          strokeWidth: shape.size,
          tension: 0.5,
          lineCap: 'round',
          lineJoin: 'round',
          globalCompositeOperation: shape.tool === 'eraser' ? 'destination-out' : 'source-over',
          opacity: shape.tool === 'eraser' ? 1 : (shape.hardness / 100) * 0.8 + 0.2,
          shadowBlur: shape.tool === 'eraser' ? 0 : (100 - shape.hardness) / 2,
          shadowColor: maskColor,
        }));
      }
    });
    overlayLayer.add(new Konva.Rect({
      x: 0,
      y: 0,
      width: exportWidth,
      height: exportHeight,
      fill: maskColor,
      globalCompositeOperation: 'source-in',
    }));
    overlayLayer.draw();

    const overlayCanvas = overlayStage.toCanvas({ pixelRatio: 1 });
    const maskedCanvas = document.createElement('canvas');
    maskedCanvas.width = exportWidth;
    maskedCanvas.height = exportHeight;
    const maskedContext = maskedCanvas.getContext('2d', { alpha: true });
    if (!maskedContext) {
      overlayStage.destroy();
      return;
    }
    maskedContext.drawImage(image, 0, 0, exportWidth, exportHeight);
    maskedContext.drawImage(overlayCanvas, 0, 0);

    const dalleStage = new Konva.Stage({
      container: document.createElement('div'),
      width: exportWidth,
      height: exportHeight,
    });
    const dalleLayer = new Konva.Layer();
    dalleStage.add(dalleLayer);
    dalleLayer.add(new Konva.Rect({
      x: 0,
      y: 0,
      width: exportWidth,
      height: exportHeight,
      fill: 'black',
    }));

    shapes.forEach((shape) => {
      if (shape.type === 'wand_mask' || shape.type === 'bitmap_mask') {
        dalleLayer.add(new Konva.Image({
          image: shape.image,
          width: exportWidth,
          height: exportHeight,
          globalCompositeOperation: 'destination-out',
        }));
      } else if (shape.type === 'rect') {
        dalleLayer.add(new Konva.Rect({
          x: Math.min(shape.points[0], shape.points[2]),
          y: Math.min(shape.points[1], shape.points[3]),
          width: Math.abs(shape.points[2] - shape.points[0]),
          height: Math.abs(shape.points[3] - shape.points[1]),
          fill: 'black',
          globalCompositeOperation: 'destination-out',
        }));
      } else {
        dalleLayer.add(new Konva.Line({
          points: shape.points,
          stroke: 'black',
          strokeWidth: shape.size,
          tension: 0.5,
          lineCap: 'round',
          lineJoin: 'round',
          globalCompositeOperation: shape.tool === 'eraser' ? 'source-over' : 'destination-out',
          opacity: shape.tool === 'eraser' ? 1 : (shape.hardness / 100) * 0.8 + 0.2,
        }));
      }
    });
    dalleLayer.draw();
    const dalleCanvas = dalleStage.toCanvas({ pixelRatio: 1 });

    try {
      const [maskedImageUrl, dalleMaskUrl, maskOverlayUrl] = await Promise.all([
        canvasToManagedImageUrl(maskedCanvas),
        canvasToManagedImageUrl(dalleCanvas),
        canvasToManagedImageUrl(overlayCanvas),
      ]);
      if (exportSequence !== exportSequenceRef.current) {
        revokeManagedImageUrl(maskedImageUrl);
        revokeManagedImageUrl(dalleMaskUrl);
        revokeManagedImageUrl(maskOverlayUrl);
        return;
      }
      onMaskChangeRef.current(maskedImageUrl, dalleMaskUrl, maskOverlayUrl);
    } catch (error) {
      console.error('Unable to export image mask:', error);
    } finally {
      overlayStage.destroy();
      dalleStage.destroy();
    }
  }

  useEffect(() => {
    if (image && linesRef.current.length > 0) {
      void exportMask(linesRef.current);
    }
  }, [image, maskColor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (!e.repeat) setIsSpacePressed(true);
      }
      if (e.ctrlKey || e.metaKey) {
        const keyLower = e.key ? e.key.toLowerCase() : '';
        const isZ = keyLower === 'z' || e.code === 'KeyZ' || e.key === 'ئ';
        if (isZ) {
          e.preventDefault();
          const direction = e.shiftKey ? 1 : -1;
          const nextStep = historyStepRef.current + direction;
          if (nextStep >= 0 && nextStep < historyRef.current.length) {
            const snapshot = historyRef.current[nextStep];
            setCurrentLines(snapshot);
            setCurrentHistory(historyRef.current, nextStep);
            void exportMask(snapshot);
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [image, maskColor]);

  return (
    <div ref={containerRef} className="absolute inset-2 sm:inset-6 overflow-hidden rounded-2xl bg-black/20 touch-none" id="canvas-container">
      {!imageUrl ? (
        <div className="absolute inset-0 flex items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-white/5">
          <p className="text-white/50 text-center">
            Upload an image to start<br/>
            <span className="text-sm">or press Ctrl+V to paste</span>
          </p>
        </div>
      ) : (
        dimensions.width > 0 && dimensions.height > 0 && (
          <Stage
            width={dimensions.width}
            height={dimensions.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            onWheel={handleWheel}
            onMouseEnter={() => setMouseInStage(true)}
            onMouseLeave={() => setMouseInStage(false)}
            scaleX={stageScale}
            scaleY={stageScale}
          x={stageX}
          y={stageY}
          draggable={tool === 'pan' || isSpacePressed}
          ref={stageRef}
          className={cn(
            (tool === 'pan' || isSpacePressed) ? 'cursor-grab active:cursor-grabbing' : 
            (tool === 'rect' || tool === 'wand') ? 'cursor-crosshair' : 'cursor-none'
          )}
        >
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              width={image.naturalWidth || image.width || 800}
              height={image.naturalHeight || image.height || 600}
            />
          )}
        </Layer>
        <Layer ref={layerRef}>
          <Group
            clipX={0}
            clipY={0}
            clipWidth={image ? (image.naturalWidth || image.width) : 800}
            clipHeight={image ? (image.naturalHeight || image.height) : 600}
          >
            {lines.map((shape, i) => {
              if (shape.type === 'wand_mask' || shape.type === 'bitmap_mask') {
                return (
                  <KonvaImage
                    key={i}
                    image={shape.image}
                    width={image ? (image.naturalWidth || image.width) : 800}
                    height={image ? (image.naturalHeight || image.height) : 600}
                    globalCompositeOperation="source-over"
                    opacity={1}
                  />
                );
              }
              if (shape.type === 'rect') {
                const x = Math.min(shape.points[0], shape.points[2]);
                const y = Math.min(shape.points[1], shape.points[3]);
                const width = Math.abs(shape.points[2] - shape.points[0]);
                const height = Math.abs(shape.points[3] - shape.points[1]);
                return (
                  <React.Fragment key={i}>
                    <Rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={maskColor}
                      globalCompositeOperation="source-over"
                      opacity={1}
                    />
                    {/* Subtle outline for visibility */}
                    <Rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      stroke="white"
                      strokeWidth={1 / stageScale}
                      opacity={0.3}
                      listening={false}
                    />
                  </React.Fragment>
                );
              }
              return (
                <Line
                  key={i}
                  points={shape.points}
                  stroke={maskColor}
                  strokeWidth={shape.size}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                  globalCompositeOperation={
                    shape.tool === 'eraser' ? 'destination-out' : 'source-over'
                  }
                  opacity={shape.tool === 'eraser' ? 1 : (shape.hardness / 100) * 0.8 + 0.2}
                  shadowBlur={shape.tool === 'eraser' ? 0 : (100 - shape.hardness) / 2}
                  shadowColor={maskColor}
                />
              );
            })}
          </Group>
        </Layer>
        <Layer ref={cursorLayerRef}>
          {mouseInStage && (tool === 'brush' || tool === 'eraser') && !isSpacePressed && (
            <Group ref={cursorGroupRef} listening={false}>
              {/* Outer white outline */}
              <Circle
                radius={actualBrushSize / 2 + 0.5 / stageScale}
                stroke="white"
                strokeWidth={1 / stageScale}
                opacity={0.8}
              />
              {/* Inner dark outline */}
              <Circle
                radius={actualBrushSize / 2 - 0.5 / stageScale}
                stroke="black"
                strokeWidth={1 / stageScale}
                opacity={0.3}
              />
              {/* Main Indicator Circle */}
              <Circle
                radius={actualBrushSize / 2}
                stroke={tool === 'eraser' ? 'white' : maskColor}
                strokeWidth={1.5 / stageScale}
                opacity={1}
              />
            </Group>
          )}
          {mouseInStage && tool === 'wand' && !isSpacePressed && (
            <Group ref={cursorGroupRef} listening={false}>
              {/* Outer black shadow ring */}
              <Circle
                radius={10 / stageScale}
                stroke="black"
                strokeWidth={2.5 / stageScale}
                opacity={0.4}
              />
              {/* Outer white ring */}
              <Circle
                radius={10 / stageScale}
                stroke="white"
                strokeWidth={1.2 / stageScale}
                opacity={0.9}
              />
              {/* Inner target circle using the selected mask color */}
              <Circle
                radius={4 / stageScale}
                stroke={maskColor}
                strokeWidth={1.5 / stageScale}
                opacity={1}
              />
              {/* Center pointer dot */}
              <Circle
                radius={1 / stageScale}
                fill="white"
                opacity={1}
              />
              {/* Reticle horizontal crosshair lines (black shadow + white line) */}
              <Line
                points={[-16 / stageScale, 0, -6 / stageScale, 0]}
                stroke="black"
                strokeWidth={2.5 / stageScale}
                opacity={0.4}
              />
              <Line
                points={[-15 / stageScale, 0, -6 / stageScale, 0]}
                stroke="white"
                strokeWidth={1 / stageScale}
                opacity={0.9}
              />
              <Line
                points={[6 / stageScale, 0, 16 / stageScale, 0]}
                stroke="black"
                strokeWidth={2.5 / stageScale}
                opacity={0.4}
              />
              <Line
                points={[6 / stageScale, 0, 15 / stageScale, 0]}
                stroke="white"
                strokeWidth={1 / stageScale}
                opacity={0.9}
              />
              {/* Reticle vertical crosshair lines (black shadow + white line) */}
              <Line
                points={[0, -16 / stageScale, 0, -6 / stageScale]}
                stroke="black"
                strokeWidth={2.5 / stageScale}
                opacity={0.4}
              />
              <Line
                points={[0, -15 / stageScale, 0, -6 / stageScale]}
                stroke="white"
                strokeWidth={1 / stageScale}
                opacity={0.9}
              />
              <Line
                points={[0, 6 / stageScale, 0, 16 / stageScale]}
                stroke="black"
                strokeWidth={2.5 / stageScale}
                opacity={0.4}
              />
              <Line
                points={[0, 6 / stageScale, 0, 15 / stageScale]}
                stroke="white"
                strokeWidth={1 / stageScale}
                opacity={0.9}
              />
            </Group>
          )}
        </Layer>
      </Stage>
        )
      )}
    </div>
  );
}

export default React.memo(CanvasWorkspace);
