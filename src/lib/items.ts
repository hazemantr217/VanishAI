import type { BatchItem } from '../types';

function clearGeneratedState(item: BatchItem): BatchItem {
  return {
    ...item,
    resultImage: null,
    maskedImage: null,
    dalleMaskImage: null,
    maskOverlayImage: null,
    variants: undefined,
    activeVariantIndex: undefined,
    status: 'pending',
    errorMessage: undefined,
  };
}

export function acceptItemResult(item: BatchItem): BatchItem {
  if (!item.resultImage) return item;
  return clearGeneratedState({
    ...item,
    editHistory: [...item.editHistory, item.originalImage],
    redoEditHistory: [],
    originalImage: item.resultImage,
  });
}

export function undoItem(item: BatchItem): BatchItem {
  if (item.resultImage) return clearGeneratedState(item);

  if (item.editHistory.length > 0) {
    const editHistory = [...item.editHistory];
    const previousImage = editHistory.pop()!;
    return clearGeneratedState({
      ...item,
      originalImage: previousImage,
      editHistory,
      redoEditHistory: [...(item.redoEditHistory || []), item.originalImage],
    });
  }

  if (item.initialImage !== item.originalImage) {
    return clearGeneratedState({
      ...item,
      originalImage: item.initialImage,
      redoEditHistory: [...(item.redoEditHistory || []), item.originalImage],
    });
  }

  return item;
}

export function redoItem(item: BatchItem): BatchItem {
  if (!item.redoEditHistory?.length) return item;
  const redoEditHistory = [...item.redoEditHistory];
  const nextImage = redoEditHistory.pop()!;
  return clearGeneratedState({
    ...item,
    originalImage: nextImage,
    editHistory: [...item.editHistory, item.originalImage],
    redoEditHistory,
  });
}
