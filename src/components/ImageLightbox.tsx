import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Eye, Image as ImageIcon, ChevronLeft, ChevronRight, Split, ZoomIn, ZoomOut, Maximize2, RotateCcw, Move, Undo, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface BatchItem {
  id: string;
  initialImage: string;
  originalImage: string;
  editHistory: string[];
  redoEditHistory?: string[];
  maskedImage: string | null;
  resultImage: string | null;
  variants?: string[];
  activeVariantIndex?: number;
  inputImages?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
}

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  item: BatchItem | null;
  idx: number;
  totalItems?: number;
  onPrevItem?: () => void;
  onNextItem?: () => void;
  onSelectVariant?: (variantUrl: string, variantIndex: number) => void;
  onDownload?: () => void;
  onUndo?: () => void;
  onAccept?: () => void;
}

export default function ImageLightbox({
  isOpen,
  onClose,
  item,
  idx,
  totalItems = 1,
  onPrevItem,
  onNextItem,
  onSelectVariant,
  onDownload,
  onUndo,
  onAccept
}: ImageLightboxProps) {
  const [viewMode, setViewMode] = useState<'result' | 'original' | 'side-by-side'>('result');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isPressingHold, setIsPressingHold] = useState(false);
  const [selectedInputIdx, setSelectedInputIdx] = useState<number>(0);

  // Zoom & Pan state
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panPosition, setPanPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const resetZoom = () => {
    setZoomScale(1);
    setPanPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoomScale(prev => Math.min(4, +(prev + 0.5).toFixed(1)));
  };

  const handleZoomOut = () => {
    setZoomScale(prev => {
      const next = Math.max(1, +(prev - 0.5).toFixed(1));
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleDoubleClick = () => {
    if (zoomScale > 1) {
      resetZoom();
    } else {
      setZoomScale(2.5);
    }
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setZoomScale(prev => {
      const next = Math.min(4, Math.max(1, +(prev + delta).toFixed(2)));
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Pan handlers
  const handleMouseDownPan = (e: React.MouseEvent) => {
    if (zoomScale > 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panPosition.x, y: e.clientY - panPosition.y };
    } else if (hasResult && viewMode === 'result') {
      setIsPressingHold(true);
    }
  };

  const handleMouseMovePan = (e: React.MouseEvent) => {
    if (isPanning && zoomScale > 1) {
      setPanPosition({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
    }
  };

  const handleMouseUpPan = () => {
    setIsPanning(false);
    setIsPressingHold(false);
  };

  // Active variants and indices
  const variants = item?.variants || [];
  const activeVariantIdx = item?.activeVariantIndex ?? 0;

  // Sync viewMode: if result is available, default to 'result', otherwise 'original'
  useEffect(() => {
    if (item && item.resultImage) {
      setViewMode('result');
    } else {
      setViewMode('original');
    }
    setIsPressingHold(false);
    setSelectedInputIdx(0);
    resetZoom();
  }, [item]);

  // Listen for keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Left and Right arrows to navigate between batch images
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onNextItem?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onPrevItem?.();
      }

      // Up and Down arrows to switch between image variants or inputs
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (variants && variants.length > 1) {
          const nextIdx = (activeVariantIdx - 1 + variants.length) % variants.length;
          onSelectVariant?.(variants[nextIdx], nextIdx);
          setViewMode('result');
        } else if (item?.inputImages && item.inputImages.length > 1) {
          setSelectedInputIdx(prev => (prev - 1 + item.inputImages!.length) % item.inputImages!.length);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (variants && variants.length > 1) {
          const nextIdx = (activeVariantIdx + 1) % variants.length;
          onSelectVariant?.(variants[nextIdx], nextIdx);
          setViewMode('result');
        } else if (item?.inputImages && item.inputImages.length > 1) {
          setSelectedInputIdx(prev => (prev + 1) % item.inputImages!.length);
        }
      }

      // Zoom shortcuts
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onPrevItem, onNextItem, onSelectVariant, variants, activeVariantIdx, item?.inputImages]);

  if (!isOpen || !item) return null;

  const currentResult = item.resultImage || item.originalImage;
  const hasResult = !!item.resultImage;

  const handleSliderMove = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(position);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 0) return;
    const container = e.currentTarget.getBoundingClientRect();
    handleSliderMove(e.touches[0].clientX, container);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSlider && e.buttons !== 1) return;
    const container = e.currentTarget.getBoundingClientRect();
    handleSliderMove(e.clientX, container);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col justify-between bg-black/98 backdrop-blur-xl p-4 md:p-6"
        dir="rtl"
      >
        {/* Top Header Controls */}
        <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-white font-sans">معاينة متقدمة وتكبير عالي الدقة</h3>
                {totalItems > 1 && (
                  <span className="text-[11px] font-mono font-bold bg-purple-950/70 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
                    {idx + 1} / {totalItems}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-400 font-sans mt-0.5">الصورة #{idx + 1} • {item.status === 'completed' ? "معالجة مكتملة" : "معاينة الأصل"}</p>
            </div>

            {/* Quick Prev / Next Buttons in Header */}
            {totalItems > 1 && (
              <div className="hidden sm:flex items-center bg-neutral-900 border border-white/10 rounded-xl p-1 gap-1 mr-2">
                <button
                  type="button"
                  onClick={onPrevItem}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 text-xs"
                  title="الصورة السابقة (السهم الأيمن ▶)"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-[10px]">السابق</span>
                </button>
                <button
                  type="button"
                  onClick={onNextItem}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center gap-1 text-xs"
                  title="الصورة التالية (السهم الأيسر ◀)"
                >
                  <span className="text-[10px]">التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Quick View Mode Switchers & Zoom Controls */}
          <div className="flex items-center gap-2">
            {hasResult && (
              <div className="flex items-center bg-neutral-900 border border-white/10 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => { setViewMode('result'); resetZoom(); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                    viewMode === 'result'
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  ✨ النتيجة النهائية
                </button>
                <button
                  type="button"
                  onClick={() => { setViewMode('side-by-side'); resetZoom(); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1",
                    viewMode === 'side-by-side'
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  <Split className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">مقارنة تفاعلية</span>
                </button>
              </div>
            )}

            {/* Zoom Control Group */}
            <div className="flex items-center bg-neutral-900 border border-white/10 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomScale >= 4}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                title="تكبير (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono font-bold text-purple-300 px-1.5 min-w-[3rem] text-center select-none">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomScale <= 1}
                className="p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
                title="تصغير (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              {zoomScale > 1 && (
                <button
                  type="button"
                  onClick={resetZoom}
                  className="p-1.5 rounded-lg text-amber-400 hover:text-white hover:bg-amber-500/20 transition-all cursor-pointer"
                  title="إعادة ضبط الحجم (100%)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Actions & Close */}
          <div className="flex items-center gap-2">
            {onAccept && item.status === 'completed' && (
              <button
                onClick={onAccept}
                className="p-2.5 rounded-xl bg-green-600 hover:bg-green-500 text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold font-sans shadow-md shadow-green-500/20"
                title="اعتماد هذه النتيجة"
              >
                <Check className="w-4 h-4" />
                <span className="hidden sm:inline">اعتماد</span>
              </button>
            )}

            {onUndo && ((item.editHistory && item.editHistory.length > 0) || item.resultImage) && (
              <button
                onClick={onUndo}
                className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 border border-amber-500/30 text-amber-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold font-sans"
                title="التراجع عن التعديل أو النتيجة الأخيرة"
              >
                <Undo className="w-4 h-4" />
                <span className="hidden sm:inline">تراجع</span>
              </button>
            )}

            {onDownload && (
              <button
                onClick={onDownload}
                className="p-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-neutral-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold font-sans"
                title="تحميل الصورة النشطة"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">تحميل الصورة</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-red-950/20 hover:bg-red-600/20 border border-red-500/25 text-red-400 hover:text-white transition-all cursor-pointer"
              title="إغلاق المعاينة (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Center Main Stage */}
        <div 
          ref={containerRef}
          onWheel={handleWheel}
          className="flex-1 flex items-center justify-center relative overflow-hidden my-2 md:my-4 select-none"
        >
          {/* Floating Navigation Arrow (Right / Previous in RTL) */}
          {totalItems > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrevItem?.();
              }}
              className="absolute right-2 md:right-5 top-1/2 -translate-y-1/2 z-40 p-3 md:p-4 rounded-2xl bg-black/75 hover:bg-purple-600/90 text-white border border-white/15 hover:border-purple-400/50 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer group"
              title="الصورة السابقة (السهم الأيمن ▶)"
            >
              <ChevronRight className="w-6 h-6 md:w-7 md:h-7 transition-transform group-hover:translate-x-0.5" />
              <span className="sr-only">السابق</span>
            </button>
          )}

          {/* Floating Navigation Arrow (Left / Next in RTL) */}
          {totalItems > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNextItem?.();
              }}
              className="absolute left-2 md:left-5 top-1/2 -translate-y-1/2 z-40 p-3 md:p-4 rounded-2xl bg-black/75 hover:bg-purple-600/90 text-white border border-white/15 hover:border-purple-400/50 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer group"
              title="الصورة التالية (السهم الأيسر ◀)"
            >
              <ChevronLeft className="w-6 h-6 md:w-7 md:h-7 transition-transform group-hover:-translate-x-0.5" />
              <span className="sr-only">التالي</span>
            </button>
          )}

          <AnimatePresence mode="wait">
            {viewMode === 'side-by-side' && hasResult ? (
              /* Interactive Comparison Slider Mode with Full Zoom & Pan */
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={cn(
                  "relative w-full max-w-4xl aspect-[4/3] md:aspect-auto md:h-full max-h-[65vh] rounded-2xl overflow-hidden border border-white/10 select-none bg-neutral-950 transition-transform duration-75",
                  zoomScale > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-ew-resize"
                )}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  const isDivider = target.closest('.slider-divider');
                  if (zoomScale > 1 && !isDivider) {
                    setIsPanning(true);
                    panStartRef.current = { x: e.clientX - panPosition.x, y: e.clientY - panPosition.y };
                  } else {
                    setIsDraggingSlider(true);
                    const container = e.currentTarget.getBoundingClientRect();
                    handleSliderMove(e.clientX, container);
                  }
                }}
                onMouseMove={(e) => {
                  if (isPanning && zoomScale > 1) {
                    setPanPosition({
                      x: e.clientX - panStartRef.current.x,
                      y: e.clientY - panStartRef.current.y
                    });
                  } else if (isDraggingSlider || (zoomScale === 1 && e.buttons === 1)) {
                    const container = e.currentTarget.getBoundingClientRect();
                    handleSliderMove(e.clientX, container);
                  }
                }}
                onMouseUp={() => {
                  setIsDraggingSlider(false);
                  setIsPanning(false);
                }}
                onMouseLeave={() => {
                  setIsDraggingSlider(false);
                  setIsPanning(false);
                }}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    setIsDraggingSlider(true);
                    const container = e.currentTarget.getBoundingClientRect();
                    handleSliderMove(e.touches[0].clientX, container);
                  }
                }}
                onTouchMove={(e) => {
                  if (isDraggingSlider && e.touches.length === 1) {
                    const container = e.currentTarget.getBoundingClientRect();
                    handleSliderMove(e.touches[0].clientX, container);
                  }
                }}
                onTouchEnd={() => setIsDraggingSlider(false)}
              >
                {/* Zoomable Content Wrapper */}
                <div 
                  className="w-full h-full relative"
                  style={{
                    transform: `scale(${zoomScale}) translate(${panPosition.x / zoomScale}px, ${panPosition.y / zoomScale}px)`,
                    transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)'
                  }}
                >
                  {/* Result Image (Background - right side) */}
                  <img
                    src={currentResult}
                    alt="Result"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    referrerPolicy="no-referrer"
                  />

                  {/* Original Image (Clip-path Slider Foreground - left side) */}
                  <img
                    src={item.inputImages && item.inputImages.length > 0 ? (item.inputImages[selectedInputIdx] || item.originalImage) : item.originalImage}
                    alt="Original"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    style={{
                      clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`
                    }}
                    referrerPolicy="no-referrer"
                  />

                  {/* Vertical Divider Slider Line */}
                  <div
                    className="slider-divider absolute inset-y-0 w-2 -ml-1 cursor-ew-resize flex items-center justify-center shadow-2xl z-10"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <div className="w-1 h-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
                    <div className="absolute w-8 h-8 rounded-full bg-white text-black border-2 border-purple-600 flex items-center justify-center shadow-lg pointer-events-none scale-100 group-hover:scale-110 transition-transform">
                      <Split className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Text Labels */}
                <div className="absolute bottom-4 left-4 bg-black/80 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold text-white border border-white/10 font-sans z-20 backdrop-blur-md">
                  {item.inputImages && item.inputImages.length > 1 ? `الصورة المدخلة #${selectedInputIdx + 1} 🖼️` : "الصورة الأصلية 🖼️"}
                </div>
                <div className="absolute bottom-4 right-4 bg-black/80 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-bold text-white border border-white/10 font-sans z-20 backdrop-blur-md flex items-center gap-2">
                  <span>النتيجة ✨</span>
                  {zoomScale > 1 && (
                    <span className="bg-purple-600/90 text-purple-100 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {Math.round(zoomScale * 100)}%
                    </span>
                  )}
                </div>
              </motion.div>
            ) : (
              /* Standard Large Image View with Zoom & Pan */
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onMouseDown={handleMouseDownPan}
                onMouseMove={handleMouseMovePan}
                onMouseUp={handleMouseUpPan}
                onMouseLeave={handleMouseUpPan}
                onDoubleClick={handleDoubleClick}
                onTouchStart={() => {
                  if (hasResult && viewMode === 'result' && zoomScale === 1) {
                    setIsPressingHold(true);
                  }
                }}
                onTouchEnd={() => setIsPressingHold(false)}
                onTouchCancel={() => setIsPressingHold(false)}
                className={cn(
                  "relative max-w-full max-h-[70vh] flex flex-col items-center justify-center select-none transition-transform duration-75",
                  zoomScale > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer"
                )}
                title={zoomScale > 1 ? "انقر واسحب للتحريك داخل الصورة | انقر مرتين لإعادة الضبط" : "انقر مرتين للتكبير (Zoom) | أو استخدم عجلة الماوس 🔍"}
              >
                <div 
                  className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl bg-neutral-950 max-w-full max-h-[65vh] flex items-center justify-center"
                  style={{
                    transform: `scale(${zoomScale}) translate(${panPosition.x / zoomScale}px, ${panPosition.y / zoomScale}px)`,
                    transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)'
                  }}
                >
                  <img
                    src={
                      (viewMode === 'original' || isPressingHold)
                        ? (item.inputImages && item.inputImages.length > 0 ? (item.inputImages[selectedInputIdx] || item.originalImage) : item.originalImage)
                        : currentResult
                    }
                    alt={(viewMode === 'original' || isPressingHold) ? "Original" : "Result"}
                    className="max-w-full max-h-[65vh] object-contain select-none pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Input Images Selector bar if item is a merged batch result */}
                {(viewMode === 'original' || isPressingHold) && item.inputImages && item.inputImages.length > 1 && (
                  <div 
                    className="mt-3 flex items-center gap-2 bg-black/80 backdrop-blur-md p-2 rounded-xl border border-white/15 z-20"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <span className="text-[10px] text-purple-300 font-bold font-sans ml-1">الصور المدمجة ({item.inputImages.length}):</span>
                    <div className="flex items-center gap-1.5 overflow-x-auto max-w-[80vw] py-0.5">
                      {item.inputImages.map((imgSrc, imgIdx) => {
                        const isSelected = selectedInputIdx === imgIdx;
                        return (
                          <button
                            key={imgIdx}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedInputIdx(imgIdx);
                            }}
                            className={cn(
                              "relative w-11 h-11 rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-neutral-900 shrink-0",
                              isSelected 
                                ? "border-amber-400 scale-105 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/40" 
                                : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
                            )}
                          >
                            <img src={imgSrc} alt={`Input ${imgIdx + 1}`} className="w-full h-full object-cover" />
                            <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[7px] text-white text-center font-bold">
                              #{imgIdx + 1}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Mode & Zoom Badge */}
                <div className="absolute bottom-4 right-4 bg-black/85 px-3 py-1.5 rounded-lg text-xs font-bold text-white border border-white/10 font-sans z-10 pointer-events-none backdrop-blur-md flex items-center gap-2">
                  <span>
                    {isPressingHold 
                      ? `🖼️ الصورة المدخلة #${selectedInputIdx + 1} (اضغط للإفلات)` 
                      : (viewMode === 'original' ? `🖼️ الصورة المدخلة #${selectedInputIdx + 1}` : "✨ النتيجة المعالجة")}
                  </span>
                  {zoomScale > 1 && (
                    <span className="bg-purple-600/90 text-purple-100 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {Math.round(zoomScale * 100)}%
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Panel - Variants list if multi-variants are available */}
        <div className="border-t border-white/5 pt-3 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0">
          {variants.length > 1 ? (
            <div className="w-full md:w-auto flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-300 font-bold font-sans">تصفح واختيار البدائل المتولدة ({variants.length}):</span>
                <span className="text-[10px] bg-purple-950/70 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-md font-mono font-bold flex items-center gap-1">
                  <span>▲ ▼ بالأسهم</span>
                  <span className="text-neutral-400 font-normal">({activeVariantIdx + 1} من {variants.length})</span>
                </span>
              </div>
              <div className="flex gap-2.5 overflow-x-auto py-1">
                {variants.map((variantUrl, vIdx) => {
                  const isSelected = activeVariantIdx === vIdx;
                  return (
                    <button
                      key={vIdx}
                      type="button"
                      onClick={() => {
                        onSelectVariant?.(variantUrl, vIdx);
                        setViewMode('result');
                        resetZoom();
                      }}
                      className={cn(
                        "relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-neutral-950 shrink-0 group",
                        isSelected
                          ? "border-purple-500 scale-105 ring-4 ring-purple-500/25 shadow-lg shadow-purple-500/30"
                          : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
                      )}
                    >
                      <img src={variantUrl} alt={`VariantOption ${vIdx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className={cn(
                        "absolute inset-x-0 bottom-0 text-[9px] text-center py-0.5 font-bold font-sans transition-colors",
                        isSelected ? "bg-purple-600 text-white" : "bg-black/80 text-neutral-300 group-hover:text-white"
                      )}>
                        {isSelected ? `✓ البديل ${vIdx + 1}` : `البديل ${vIdx + 1}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-400 font-sans flex items-center gap-1.5">
              <span>* تم توليد خيار واحد لهذه الصورة</span>
              <span className="text-neutral-500 text-[10px]">(يمكنك تفعيل &quot;توليد بدائل متعددة&quot; من الإعدادات للحصول على 4 بدائل)</span>
            </div>
          )}

          {/* Keyboard & Interactive Controls Legend */}
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 text-[10px] font-sans">
            <span className="bg-neutral-900/90 border border-white/10 text-neutral-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
              <span className="font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[9px] font-bold">◀ ▶</span>
              <span>تبديل الصور</span>
            </span>
            {variants.length > 1 && (
              <span className="bg-purple-950/70 border border-purple-500/30 text-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
                <span className="font-mono bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded text-[9px] font-bold">▲ ▼</span>
                <span>تبديل البدائل واختيارها</span>
              </span>
            )}
            <span className="bg-neutral-900/90 border border-white/10 text-neutral-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm">
              <span className="font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded text-[9px] font-bold">Zoom</span>
              <span>نقر مزدوج أو عجلة الماوس</span>
            </span>
            <span className="bg-neutral-900/90 border border-white/10 text-neutral-400 px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
              <span className="font-mono bg-white/10 text-neutral-300 px-1.5 py-0.5 rounded text-[9px]">Esc</span>
              <span>إغلاق</span>
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

