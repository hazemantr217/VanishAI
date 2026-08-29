import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Line, Circle, Rect, Group } from 'react-konva';
import Konva from 'konva';
import { cn } from '../lib/utils';

interface CanvasWorkspaceProps {
  itemId: string | null;
  imageUrl: string | null;
  tool: 'brush' | 'eraser' | 'pan' | 'rect' | 'wand';
  brushSize: number;
  brushHardness: number;
  wandTolerance?: number;
  maskColor: string;
  onMaskChange: (dataUrl: string, dalleMaskUrl?: string) => void;
  clearTrigger: number;
}

// Highly optimized flood fill algorithm for the smart Magic Wand tool
function performFloodFill(
  imageElement: HTMLImageElement,
  startX: number,
  startY: number,
  tolerance: number,
  fillColorHex: string
): HTMLImageElement | null {
  const canvas = document.createElement('canvas');
  const w = imageElement.naturalWidth || imageElement.width;
  const h = imageElement.naturalHeight || imageElement.height;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Draw original image to read pixels
  ctx.drawImage(imageElement, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Compute starting coordinate pixel index
  const startXInt = Math.round(startX);
  const startYInt = Math.round(startY);
  if (startXInt < 0 || startXInt >= w || startYInt < 0 || startYInt >= h) return null;

  const startIdx = (startYInt * w + startXInt) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];

  // Prepare blank mask image data
  const maskImgData = ctx.createImageData(w, h);
  const maskData = maskImgData.data;

  // Parse fill color HEX to RGB
  const hex = fillColorHex.replace('#', '');
  const fr = parseInt(hex.substring(0, 2), 16);
  const fg = parseInt(hex.substring(2, 4), 16);
  const fb = parseInt(hex.substring(4, 6), 16);

  // Visited pixel tracking
  const visited = new Uint8Array(w * h);

  // Stack-based iterative DFS (non-recursive to prevent Call Stack Overflow on large images)
  const stack: [number, number][] = [[startXInt, startYInt]];
  visited[startYInt * w + startXInt] = 1;

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;

    const idx = (cy * w + cx) * 4;
    maskData[idx] = fr;
    maskData[idx + 1] = fg;
    maskData[idx + 2] = fb;
    maskData[idx + 3] = 230; // Solid semi-transparent overlay for workspace (230/255)

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (!visited[nIdx]) {
          visited[nIdx] = 1;
          const pixelIdx = nIdx * 4;
          const r = data[pixelIdx];
          const g = data[pixelIdx + 1];
          const b = data[pixelIdx + 2];

          // Euclidean color distance in RGB space
          const dist = Math.sqrt(
            (r - sr) * (r - sr) +
            (g - sg) * (g - sg) +
            (b - sb) * (b - sb)
          );

          if (dist <= tolerance) {
            stack.push([nx, ny]);
          }
        }
      }
    }
  }

  // Draw completed mask image
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(maskImgData, 0, 0);

  const maskImg = new window.Image();
  maskImg.src = canvas.toDataURL('image/png');
  return maskImg;
}

export default function CanvasWorkspace({
  itemId,
  imageUrl,
  tool,
  brushSize,
  brushHardness,
  wandTolerance = 30,
  maskColor,
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
  const stageRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const cursorLayerRef = useRef<any>(null);
  const cursorGroupRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  const [lines, setLines] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [stageX, setStageX] = useState(0);
  const [stageY, setStageY] = useState(0);
  const [initialScale, setInitialScale] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [mouseInStage, setMouseInStage] = useState(false);

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
  
  const actualBrushSize = initialScale > 0 ? brushSize / initialScale : brushSize;

  // Undo/Redo state
  const [history, setHistory] = useState<any[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  useEffect(() => {
    setLines([]);
    setHistory([[]]);
    setHistoryStep(0);
  }, [itemId, imageUrl]);

  useEffect(() => {
    if (clearTrigger > 0) {
      setLines([]);
      setHistory([[]]);
      setHistoryStep(0);
      onMaskChange('');
    }
  }, [clearTrigger]);

  useEffect(() => {
    if (image && dimensions.width > 0 && dimensions.height > 0) {
      const imgWidth = image.naturalWidth || image.width || 800;
      const imgHeight = image.naturalHeight || image.height || 600;
      
      if (imgWidth > 0 && imgHeight > 0) {
        // Fit image to stage
        const scale = Math.min(
          dimensions.width / imgWidth,
          dimensions.height / imgHeight
        ) * 0.9;
        
        setInitialScale(scale);
        setStageScale(scale);
        setStageX((dimensions.width - imgWidth * scale) / 2);
        setStageY((dimensions.height - imgHeight * scale) / 2);
      }
    }
  }, [image, dimensions]);

  const handleMouseDown = (e: any) => {
    if (tool === 'pan' || isSpacePressed || e.evt.button === 1 || e.evt.button === 2) {
      if (e.evt.button === 1) {
        const stage = e.target.getStage();
        stage.draggable(true);
        stage.startDrag();
      }
      return;
    }
    
    const pos = e.target.getStage().getRelativePointerPosition();
    const imgWidth = image ? (image.naturalWidth || image.width || 800) : 800;
    const imgHeight = image ? (image.naturalHeight || image.height || 600) : 600;
    const clampedX = Math.max(0, Math.min(imgWidth, pos.x));
    const clampedY = Math.max(0, Math.min(imgHeight, pos.y));

    if (tool === 'wand') {
      if (!image) return;
      const maskImg = performFloodFill(image, clampedX, clampedY, wandTolerance, maskColor);
      if (maskImg) {
        maskImg.onload = () => {
          const newLines = [...lines, { type: 'wand_mask', image: maskImg }];
          setLines(newLines);

          const newHistory = history.slice(0, historyStep + 1);
          newHistory.push(newLines);
          setHistory(newHistory);
          setHistoryStep(newHistory.length - 1);
          
          setTimeout(exportMask, 50);
        };
      }
      return;
    }

    setIsDrawing(true);
    if (tool === 'rect') {
      setLines([...lines, { type: 'rect', tool, points: [clampedX, clampedY, clampedX, clampedY] }]);
    } else {
      setLines([...lines, { type: 'line', tool, points: [clampedX, clampedY, clampedX, clampedY], size: actualBrushSize, hardness: brushHardness }]);
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const point = stage.getRelativePointerPosition();

    if (cursorGroupRef.current && cursorLayerRef.current) {
      cursorGroupRef.current.position(point);
      cursorLayerRef.current.batchDraw();
    }

    if (!isDrawing || tool === 'pan' || isSpacePressed || tool === 'wand') return;

    let lastLine = lines[lines.length - 1];
    
    const imgWidth = image ? (image.naturalWidth || image.width || 800) : 800;
    const imgHeight = image ? (image.naturalHeight || image.height || 600) : 600;
    const clampedX = Math.max(0, Math.min(imgWidth, point.x));
    const clampedY = Math.max(0, Math.min(imgHeight, point.y));

    if (lastLine.type === 'rect') {
      lastLine.points[2] = clampedX;
      lastLine.points[3] = clampedY;
    } else {
      // add point
      lastLine.points = lastLine.points.concat([clampedX, clampedY]);
    }
    
    // replace last
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());
  };

  const handleMouseUp = (e: any) => {
    if (e.evt.button === 1) {
       const stage = e.target.getStage();
       stage.draggable(tool === 'pan' || isSpacePressed);
    }
    if (tool === 'pan' || isSpacePressed || e.evt.button === 1 || e.evt.button === 2 || tool === 'wand') return;
    setIsDrawing(false);
    
    // Save history
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(lines);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    
    exportMask();
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

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

  const exportMask = () => {
    if (!stageRef.current || !image) return;
    
    // Scale down if image is too large (max 2048px on longest side)
    const MAX_SIZE = 2048;
    const imgWidth = image.naturalWidth || image.width || 800;
    const imgHeight = image.naturalHeight || image.height || 600;
    
    let scale = 1;
    if (imgWidth > MAX_SIZE || imgHeight > MAX_SIZE) {
      scale = MAX_SIZE / Math.max(imgWidth, imgHeight);
    }

    const exportWidth = Math.round(imgWidth * scale);
    const exportHeight = Math.round(imgHeight * scale);

    // Create a temporary stage to export just the image and lines
    const tempStage = new Konva.Stage({
      container: document.createElement('div'),
      width: exportWidth,
      height: exportHeight,
    });
    
    const tempLayer = new Konva.Layer();
    tempStage.add(tempLayer);
    
    // Add image
    const tempImage = new Konva.Image({
      image: image,
      width: exportWidth,
      height: exportHeight,
    });
    tempLayer.add(tempImage);
    
    // Add lines and shapes, adjusting coordinates to be relative to the scaled image
    lines.forEach((shape: any) => {
      if (shape.type === 'wand_mask') {
        tempLayer.add(new Konva.Image({
          image: shape.image,
          x: 0,
          y: 0,
          width: exportWidth,
          height: exportHeight,
          globalCompositeOperation: 'source-over',
          opacity: 1
        }));
      } else if (shape.type === 'rect') {
        const x = Math.min(shape.points[0], shape.points[2]) * scale;
        const y = Math.min(shape.points[1], shape.points[3]) * scale;
        const width = Math.abs(shape.points[2] - shape.points[0]) * scale;
        const height = Math.abs(shape.points[3] - shape.points[1]) * scale;
        tempLayer.add(new Konva.Rect({
          x,
          y,
          width,
          height,
          fill: maskColor,
          globalCompositeOperation: shape.tool === 'eraser' ? 'destination-out' : 'source-over',
          opacity: 1
        }));
      } else {
        const scaledPoints = shape.points.map((p: number) => p * scale);
        tempLayer.add(new Konva.Line({
          points: scaledPoints,
          stroke: maskColor,
          strokeWidth: shape.size * scale,
          tension: 0.5,
          lineCap: "round",
          lineJoin: "round",
          globalCompositeOperation: shape.tool === 'eraser' ? 'destination-out' : 'source-over',
          opacity: shape.tool === 'eraser' ? 1 : (shape.hardness / 100) * 0.8 + 0.2,
          shadowBlur: shape.tool === 'eraser' ? 0 : ((100 - shape.hardness) / 2) * scale,
          shadowColor: maskColor
        }));
      }
    });
    
    tempLayer.draw();
    
    // Export standard masked image
    const dataUrl = tempStage.toDataURL({ pixelRatio: 1, mimeType: 'image/jpeg', quality: 0.9 });
    
    // Create a temporary stage to export just the transparent mask for DALL-E 2
    const maskStage = new Konva.Stage({
      container: document.createElement('div'),
      width: exportWidth,
      height: exportHeight,
    });
    
    const maskLayer = new Konva.Layer();
    maskStage.add(maskLayer);
    
    // Draw solid black background (represents non-edited parts, opaque)
    const bgRect = new Konva.Rect({
      x: 0,
      y: 0,
      width: exportWidth,
      height: exportHeight,
      fill: 'black',
      opacity: 1
    });
    maskLayer.add(bgRect);
    
    // Draw mask lines/shapes with globalCompositeOperation: 'destination-out' to clear transparency
    lines.forEach((shape: any) => {
      if (shape.type === 'wand_mask') {
        maskLayer.add(new Konva.Image({
          image: shape.image,
          x: 0,
          y: 0,
          width: exportWidth,
          height: exportHeight,
          globalCompositeOperation: 'destination-out',
          opacity: 1
        }));
      } else if (shape.type === 'rect') {
        const x = Math.min(shape.points[0], shape.points[2]) * scale;
        const y = Math.min(shape.points[1], shape.points[3]) * scale;
        const width = Math.abs(shape.points[2] - shape.points[0]) * scale;
        const height = Math.abs(shape.points[3] - shape.points[1]) * scale;
        maskLayer.add(new Konva.Rect({
          x,
          y,
          width,
          height,
          fill: 'black',
          globalCompositeOperation: 'destination-out',
          opacity: 1
        }));
      } else {
        const scaledPoints = shape.points.map((p: number) => p * scale);
        maskLayer.add(new Konva.Line({
          points: scaledPoints,
          stroke: 'black',
          strokeWidth: shape.size * scale,
          tension: 0.5,
          lineCap: "round",
          lineJoin: "round",
          globalCompositeOperation: 'destination-out',
          opacity: 1
        }));
      }
    });
    
    maskLayer.draw();
    const dalleMaskUrl = maskStage.toDataURL({ pixelRatio: 1, mimeType: 'image/png' });
    
    onMaskChange(dataUrl, dalleMaskUrl);
    
    tempStage.destroy();
    maskStage.destroy();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        if (!e.repeat) setIsSpacePressed(true);
      }
      if (e.ctrlKey || e.metaKey) {
        const keyLower = e.key ? e.key.toLowerCase() : '';
        const isZ = keyLower === 'z' || e.code === 'KeyZ' || e.key === 'ئ' || e.key === 'ئ';
        if (isZ) {
          e.preventDefault();
          if (e.shiftKey) {
            // Redo
            if (historyStep < history.length - 1) {
              setHistoryStep(historyStep + 1);
              setLines(history[historyStep + 1]);
              setTimeout(exportMask, 50);
            }
          } else {
            // Undo
            if (historyStep > 0) {
              setHistoryStep(historyStep - 1);
              setLines(history[historyStep - 1]);
              setTimeout(exportMask, 50);
            }
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
  }, [history, historyStep]);

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
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
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
              if (shape.type === 'wand_mask') {
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
