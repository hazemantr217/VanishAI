import { memo, type Dispatch, type SetStateAction } from 'react';
import { CheckCircle2, PauseCircle, PlayCircle } from 'lucide-react';
import type { BatchItem } from '../types';
import { acceptItemResult, undoItem } from '../lib/items';
import BatchCard from './BatchCard';

interface BatchGridProps {
  items: BatchItem[];
  setItems: Dispatch<SetStateAction<BatchItem[]>>;
  setActiveItemId: Dispatch<SetStateAction<string | null>>;
  setShowCropModal: Dispatch<SetStateAction<boolean>>;
  setClearTrigger: Dispatch<SetStateAction<number>>;
  setAppMode: Dispatch<SetStateAction<'vanish' | 'reimagine'>>;
  setTool: Dispatch<SetStateAction<'brush' | 'eraser' | 'pan' | 'rect' | 'wand'>>;
  setShowSidebar: Dispatch<SetStateAction<boolean>>;
  setLightboxItemId: Dispatch<SetStateAction<string | null>>;
  onDelete: (id: string) => void;
  onDownload: (imageUrl: string, filename: string) => void;
  onStop: () => void;
  onManageApiKey?: () => void;
  onToggleDisabled?: (id: string) => void;
  onProcessSingle?: (item: BatchItem) => void;
  isProcessing?: boolean;
}

function downloadBaseName(item: BatchItem): string {
  const sourceName = item.fileName?.trim();
  if (!sourceName) return `vanishai-batch-${item.id}`;
  return sourceName.replace(/\.(?:png|jpe?g|webp)$/i, '');
}

function BatchGrid({
  items,
  setItems,
  setActiveItemId,
  setShowCropModal,
  setClearTrigger,
  setAppMode,
  setTool,
  setShowSidebar,
  setLightboxItemId,
  onDelete,
  onDownload,
  onStop,
  onManageApiKey,
  onToggleDisabled,
  onProcessSingle,
  isProcessing = false,
}: BatchGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 pb-12 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={item.disabled
            ? 'relative rounded-2xl border border-amber-500/30 bg-amber-500/[0.035] p-1 opacity-80 transition hover:opacity-100'
            : 'relative'}
        >
          <div className="mb-2 flex min-h-7 items-center justify-between gap-2 px-1" dir="rtl">
            <div className="min-w-0 flex-1">
              {item.fileName && (
                <div
                  className="truncate font-mono text-[10px] text-neutral-400"
                  title={item.fileName}
                >
                  {item.fileName}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {onProcessSingle && (item.status === 'pending' || item.status === 'error') && !isProcessing && (
                <button
                  type="button"
                  onClick={() => onProcessSingle(item)}
                  className="flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-[9px] font-bold text-green-300 transition hover:bg-green-500/20"
                  title="معالجة هذه الصورة فقط"
                >
                  <PlayCircle className="h-3 w-3" />
                  تشغيل فقط
                </button>
              )}
              {onToggleDisabled && item.status !== 'processing' && (
                <button
                  type="button"
                  onClick={() => onToggleDisabled(item.id)}
                  className={item.disabled
                    ? 'flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2 py-1 text-[9px] font-bold text-amber-300 transition hover:bg-amber-500/25'
                    : 'flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold text-neutral-400 transition hover:bg-white/10 hover:text-white'}
                  title={item.disabled ? 'إعادة هذه الصورة للمعالجة الجماعية' : 'استبعاد هذه الصورة من المعالجة الجماعية'}
                >
                  {item.disabled ? <CheckCircle2 className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                  {item.disabled ? 'تفعيل' : 'استبعاد'}
                </button>
              )}
            </div>
          </div>

          <BatchCard
            item={item}
            idx={index}
            onDelete={() => onDelete(item.id)}
            onCrop={() => {
              setActiveItemId(item.id);
              setShowCropModal(true);
            }}
            onReset={() => setItems((previous) => previous.map((candidate) => candidate.id === item.id
              ? { ...candidate, status: 'pending', errorMessage: undefined, resultImage: null, variants: undefined }
              : candidate))}
            onEditInVanish={() => {
              setItems((previous) => previous.map((candidate) => candidate.id === item.id ? acceptItemResult(candidate) : candidate));
              setClearTrigger((value) => value + 1);
              setActiveItemId(item.id);
              setAppMode('vanish');
              setTool('brush');
              setShowSidebar(true);
            }}
            onAccept={() => {
              setItems((previous) => previous.map((candidate) => candidate.id === item.id ? acceptItemResult(candidate) : candidate));
              setClearTrigger((value) => value + 1);
            }}
            onUndo={() => {
              setItems((previous) => previous.map((candidate) => candidate.id === item.id ? undoItem(candidate) : candidate));
              setClearTrigger((value) => value + 1);
            }}
            onDownload={() => onDownload(item.resultImage || item.originalImage, downloadBaseName(item))}
            onStop={onStop}
            onSelectVariant={(variantUrl, variantIndex) => {
              setItems((previous) => previous.map((candidate) => candidate.id === item.id
                ? { ...candidate, resultImage: variantUrl, activeVariantIndex: variantIndex }
                : candidate));
            }}
            onImageDoubleClick={() => setLightboxItemId(item.id)}
            onManageApiKey={onManageApiKey}
          />
        </div>
      ))}
    </div>
  );
}

export default memo(BatchGrid);
