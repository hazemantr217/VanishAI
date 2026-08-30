import { memo, type Dispatch, type SetStateAction } from 'react';
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
}: BatchGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 pb-12 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
      {items.map((item, index) => (
        <BatchCard
          key={item.id}
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
          onDownload={() => onDownload(item.resultImage || item.originalImage, `vanishai-batch-${item.id}.jpg`)}
          onStop={onStop}
          onSelectVariant={(variantUrl, variantIndex) => {
            setItems((previous) => previous.map((candidate) => candidate.id === item.id
              ? { ...candidate, resultImage: variantUrl, activeVariantIndex: variantIndex }
              : candidate));
          }}
          onImageDoubleClick={() => setLightboxItemId(item.id)}
          onManageApiKey={onManageApiKey}
        />
      ))}
    </div>
  );
}

export default memo(BatchGrid);
