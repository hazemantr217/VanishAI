import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Crop, Download, Loader2, RefreshCw, Sparkles, Eye, Image as ImageIcon, Check, Undo, ZoomIn, Maximize2, StopCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { BatchItem } from '../types';

interface BatchCardProps {
  item: BatchItem;
  idx: number;
  onDelete: () => void;
  onCrop: () => void;
  onReset: () => void;
  onEditInVanish: () => void;
  onDownload: () => void;
  onAccept: () => void;
  onUndo?: () => void;
  onStop?: () => void;
  onSelectVariant?: (variantUrl: string, variantIndex: number) => void;
  onImageDoubleClick?: () => void;
}

export default function BatchCard({
  item,
  idx,
  onDelete,
  onCrop,
  onReset,
  onEditInVanish,
  onDownload,
  onAccept,
  onUndo,
  onStop,
  onSelectVariant,
  onImageDoubleClick
}: BatchCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "bg-neutral-900/60 border rounded-2xl p-4 transition-all flex flex-col gap-3 relative overflow-hidden group/card",
        item.status === 'completed' ? "border-green-500/25 shadow-lg shadow-green-500/5 bg-neutral-900/80" :
        item.status === 'processing' ? "border-purple-500/30 shadow-lg shadow-purple-500/5 bg-neutral-900/70" :
        item.status === 'error' ? "border-red-500/25 bg-red-950/10" : "border-white/5 hover:border-white/10"
      )}
      dir="rtl"
    >
      {/* Top Status Indicators & Badges */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-neutral-300">
          {item.id.startsWith('merged-') ? "🧩 نتيجة دمج كافة الصور" : `الصورة #${idx + 1}`}
        </span>
        
        <div className="flex items-center gap-1.5">
          {item.status === 'completed' && (
            <span className="text-[10px] bg-green-500/15 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
              مكتملة بنجاح ✅
            </span>
          )}
          {item.status === 'processing' && (
            <span className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 animate-pulse">
              <span className="w-1 h-1 bg-purple-500 rounded-full"></span>
              جاري المعالجة بالتوازي... ⚡
            </span>
          )}
          {item.status === 'error' && (
            <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1 h-1 bg-red-500 rounded-full"></span>
              فشل التوليد ❌
            </span>
          )}
          {item.status === 'pending' && (
            <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1 h-1 bg-neutral-500 rounded-full"></span>
              بانتظار البدء 🕒
            </span>
          )}
        </div>
      </div>

      {/* Image Preview Area */}
      <div 
        onClick={(e) => {
          // If clicked directly and not processing, open lightbox
          if (item.status !== 'processing' && onImageDoubleClick) {
            onImageDoubleClick();
          }
        }}
        onMouseDown={(e) => {
          if (item.resultImage) {
            setShowOriginal(true);
          }
        }}
        onMouseUp={() => {
          if (item.resultImage) {
            setShowOriginal(false);
          }
        }}
        onMouseLeave={() => {
          if (item.resultImage) {
            setShowOriginal(false);
          }
        }}
        onTouchStart={() => {
          if (item.resultImage) {
            setShowOriginal(true);
          }
        }}
        onTouchEnd={() => {
          if (item.resultImage) {
            setShowOriginal(false);
          }
        }}
        onTouchCancel={() => {
          if (item.resultImage) {
            setShowOriginal(false);
          }
        }}
        className={cn(
          "h-48 rounded-xl overflow-hidden bg-black/40 relative border border-white/5 flex items-center justify-center cursor-pointer active:scale-[0.99] transition-transform select-none group/imgbox",
          item.status === 'processing' && "cursor-wait active:scale-100"
        )}
        title="انقر لفتح معاينة تفاعلية بملء الشاشة للتكبير والدقة العالية 🔍"
      >
        {showOriginal ? (
          item.inputImages && item.inputImages.length > 1 ? (
            <div className="w-full h-full p-2 grid grid-cols-2 gap-1.5 bg-black/90 overflow-y-auto z-0">
              {item.inputImages.map((imgSrc, imgIdx) => (
                <div key={imgIdx} className="relative rounded-lg overflow-hidden bg-neutral-900 aspect-square border border-white/10 group/thumb">
                  <img src={imgSrc} alt={`Input Image ${imgIdx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1 right-1 bg-black/80 text-[8px] text-white px-1.5 py-0.5 rounded font-mono font-bold border border-white/10">
                    #{imgIdx + 1}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <img
              src={item.originalImage}
              alt={`Batch Image ${idx + 1}`}
              className="w-full h-full object-contain pointer-events-none select-none"
              referrerPolicy="no-referrer"
            />
          )
        ) : (
          <img
            src={item.resultImage || item.originalImage}
            alt={`Batch Image ${idx + 1}`}
            className="w-full h-full object-contain pointer-events-none select-none"
            referrerPolicy="no-referrer"
          />
        )}

        {/* Hover Fullscreen Zoom Prompt Badge */}
        {item.status === 'completed' && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onImageDoubleClick?.();
              }}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-black/80 hover:bg-purple-600 text-white border border-white/15 transition-all shadow-lg flex items-center gap-1 backdrop-blur-md cursor-pointer"
              title="فتح معاينة مكبرة بملء الشاشة (Zoom)"
            >
              <ZoomIn className="w-3 h-3 text-purple-300 group-hover/imgbox:scale-110 transition-transform" />
              <span>تكبير 🔍</span>
            </button>
          </div>
        )}

        {/* Hold Indicator overlay */}
        {item.resultImage && showOriginal && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none z-10 animate-fade-in">
            <span className="bg-amber-500/95 text-black text-[9px] font-bold px-2 py-1 rounded-md backdrop-blur-md border border-amber-400 font-sans shadow-lg">
              {item.inputImages && item.inputImages.length > 1 ? `الصور المدخلة للدمج (${item.inputImages.length} صور) 🖼️` : "صورة الأصل 🖼️"}
            </span>
          </div>
        )}

        {/* Floating Toggle Comparison Button (if completed) */}
        {item.resultImage && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowOriginal(!showOriginal);
            }}
            className={cn(
              "absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shadow-lg flex items-center gap-1 backdrop-blur-md border cursor-pointer z-10",
              showOriginal 
                ? "bg-amber-500 text-black border-amber-400" 
                : "bg-black/70 text-green-300 border-white/10 hover:bg-black/90"
            )}
            title="انقر للتبديل بين الصور المدخلة وصورة النتيجة، أو اضغط مع الاستمرار على الصورة"
          >
            <Eye className="w-3 h-3" />
            <span>{showOriginal ? (item.inputImages && item.inputImages.length > 1 ? "عرض الصور المدخلة" : "عرض الأصل") : "عرض النتيجة"}</span>
          </button>
        )}

        {/* Processing Loader Overlay */}
        <AnimatePresence>
          {item.status === 'processing' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center p-3 text-center"
            >
              <div className="relative mb-2">
                <div className="absolute -inset-3 bg-purple-500/20 rounded-full blur-lg animate-pulse"></div>
                <div className="w-10 h-10 rounded-full border-2 border-neutral-800 border-t-purple-500 animate-spin flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className="text-[10px] text-neutral-300 font-medium">جاري معالجة طلب الـ API...</p>
              <span className="text-[8px] text-neutral-500 mt-1">يتم التوليد بالتوازي لسرعة فائقة</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hover action overlay for pending state */}
        {item.status === 'pending' && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              onClick={onCrop}
              className="p-2 rounded-lg bg-neutral-900/95 hover:bg-purple-600 border border-white/10 text-white transition-all scale-95 group-hover/card:scale-100 cursor-pointer"
              title="قص وتعديل أبعاد الصورة"
            >
              <Crop className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg bg-red-950/95 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white transition-all scale-95 group-hover/card:scale-100 cursor-pointer"
              title="حذف هذه الصورة من الباتش"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Individual Error Messages */}
      {item.status === 'error' && (
        <div className="p-2 rounded-xl bg-red-950/20 border border-red-500/20 text-right">
          <p className="text-[10px] text-red-200 leading-normal font-sans">
            {item.errorMessage || "حدث خطأ غير معروف أثناء التوليد."}
          </p>
        </div>
      )}

      {/* Variants Switcher (Direct interactive list on the card) */}
      {item.status === 'completed' && item.variants && item.variants.length > 1 && (
        <div className="flex flex-col gap-1.5 bg-black/40 p-2.5 rounded-xl border border-white/5" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400 font-sans font-bold">البدائل المولدة:</span>
            <span className="text-[9px] bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded-md border border-purple-500/10 font-bold font-mono">
              {item.variants.length} خيارات
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
            {item.variants.map((variantUrl, vIdx) => {
              const isSelected = item.activeVariantIndex === vIdx || (!item.activeVariantIndex && vIdx === 0);
              return (
                <button
                  key={vIdx}
                  type="button"
                  onClick={() => onSelectVariant?.(variantUrl, vIdx)}
                  className={cn(
                    "relative w-10 h-10 rounded-lg overflow-hidden border transition-all cursor-pointer bg-neutral-950 shrink-0",
                    isSelected 
                      ? "border-purple-500 scale-105 ring-2 ring-purple-500/35 shadow-md shadow-purple-500/15" 
                      : "border-white/10 hover:border-white/30"
                  )}
                  title={`عرض البديل ${vIdx + 1}`}
                >
                  <img src={variantUrl} alt={`Variant ${vIdx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-x-0 bottom-0 bg-purple-900/90 text-[8px] text-white text-center py-0.5 font-bold font-sans">
                    {vIdx + 1}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons Area */}
      <div className="mt-2 border-t border-white/5 pt-2.5 w-full">
        {item.status === 'completed' && (
          <div className="flex flex-col gap-1.5 w-full">
            {/* Row 1: Primary decision actions */}
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <button
                type="button"
                onClick={onAccept}
                className={cn(
                  "py-2 px-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-green-500/10 cursor-pointer active:scale-95",
                  !onUndo && "col-span-2"
                )}
                title="اعتماد النتيجة الحالية كصورة أساسية للمزيد من التعديل"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">اعتماد (Accept)</span>
              </button>

              {onUndo && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="py-2 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white text-[11px] sm:text-xs font-bold border border-amber-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                  title="التراجع عن النتيجة والعودة للصورة الأصلية"
                >
                  <Undo className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">تراجع</span>
                </button>
              )}
            </div>

            {/* Row 2: Tools (Zoom, Download, Edit) */}
            <div className="grid grid-cols-3 gap-1.5 w-full">
              <button
                type="button"
                onClick={onImageDoubleClick}
                className="py-1.5 px-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] sm:text-[11px] font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-500/10 cursor-pointer border border-purple-400/30 active:scale-95"
                title="فتح الصورة بملء الشاشة للتكبير وفحص أدق التفاصيل"
              >
                <ZoomIn className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap truncate">تكبير وتفاصيل</span>
              </button>

              <button
                type="button"
                onClick={onDownload}
                className="py-1.5 px-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] sm:text-[11px] font-bold transition-all flex items-center justify-center gap-1 shadow-md shadow-blue-500/10 cursor-pointer active:scale-95"
                title="تحميل النتيجة إلى جهازك"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap truncate">تحميل</span>
              </button>

              <button
                type="button"
                onClick={onEditInVanish}
                className="py-1.5 px-1.5 rounded-lg bg-purple-900/40 hover:bg-purple-700/60 text-purple-200 hover:text-white text-[10px] sm:text-[11px] font-bold border border-purple-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                title="تعديل هذه النتيجة بالفرشاة أو مسح أجزاء منها"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-purple-300" />
                <span className="whitespace-nowrap truncate">تعديل يدوي</span>
              </button>
            </div>
          </div>
        )}

        {item.status === 'error' && (
          <div className="flex flex-col gap-1.5 w-full">
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <button
                type="button"
                onClick={onReset}
                className={cn(
                  "py-2 px-2 rounded-lg bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-[11px] font-bold border border-red-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer",
                  !(onUndo && item.editHistory && item.editHistory.length > 0) && "col-span-2"
                )}
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>إعادة المحاولة</span>
              </button>
              {onUndo && item.editHistory && item.editHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="py-2 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all border border-amber-500/20 cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
                  title="تراجع للصورة السابقة"
                >
                  <Undo className="w-3.5 h-3.5 shrink-0" />
                  <span>تراجع</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="w-full py-1.5 px-2 rounded-lg bg-red-500/15 hover:bg-red-500 hover:text-white text-red-400 font-bold transition-all border border-red-500/30 cursor-pointer flex items-center justify-center gap-1 text-[11px]"
              title="حذف من الدفعة"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>حذف من الدفعة</span>
            </button>
          </div>
        )}

        {item.status === 'pending' && (
          <div className="flex flex-col gap-1.5 w-full">
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <button
                type="button"
                onClick={onCrop}
                className="py-1.5 px-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 hover:text-white text-neutral-300 text-[11px] font-bold border border-white/5 transition-all flex items-center justify-center gap-1 cursor-pointer"
                title="قص وتعديل أبعاد الصورة"
              >
                <Crop className="w-3.5 h-3.5 shrink-0" />
                <span>قص وتعديل</span>
              </button>

              <button
                type="button"
                onClick={onDownload}
                className="py-1.5 px-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-all border border-blue-500/20 cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
                title="تحميل هذه الصورة"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>تحميل</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 w-full">
              {onUndo && ((item.editHistory && item.editHistory.length > 0) || (item.redoEditHistory && item.redoEditHistory.length > 0)) && (
                <button
                  type="button"
                  onClick={onUndo}
                  className="py-1.5 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all border border-amber-500/20 cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
                  title="تراجع للصورة السابقة"
                >
                  <Undo className="w-3.5 h-3.5 shrink-0" />
                  <span>تراجع</span>
                </button>
              )}

              <button
                type="button"
                onClick={onDelete}
                className={cn(
                  "py-1.5 px-2 rounded-lg bg-red-500/15 hover:bg-red-500 hover:text-white text-red-400 font-bold transition-all border border-red-500/30 cursor-pointer flex items-center justify-center gap-1 text-[11px]",
                  !(onUndo && ((item.editHistory && item.editHistory.length > 0) || (item.redoEditHistory && item.redoEditHistory.length > 0))) && "col-span-2"
                )}
                title="حذف من الدفعة"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>حذف من الدفعة</span>
              </button>
            </div>
          </div>
        )}

        {item.status === 'processing' && (
          <div className="w-full flex items-center justify-between gap-2 py-1.5 px-1 text-xs">
            <span className="text-purple-400/90 font-medium truncate">يتم المعالجة مع صور الدفعة...</span>
            {onStop && (
              <button
                type="button"
                onClick={onStop}
                className="px-2.5 py-1 bg-red-600/85 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-sm animate-pulse"
                title="إيقاف إجباري للمعالجة فوراً"
              >
                <StopCircle className="w-3 h-3" />
                <span>إيقاف</span>
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
