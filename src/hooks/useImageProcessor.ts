import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { BatchItem } from '../types';
import type { RuntimeConfig } from '../shared/api';
import type { AspectRatio, ImageModel, ImageSize } from '../shared/models';
import { isOpenAIModel } from '../shared/models';
import { requestBatchMerge, requestInpaint } from '../services/api';
import { lockPixelsOutsideMask, toPngImageUrl } from '../lib/images';
import { mapWithConcurrency } from '../lib/concurrency';

interface ImageProcessorOptions {
  items: BatchItem[];
  setItems: Dispatch<SetStateAction<BatchItem[]>>;
  runtimeConfig: RuntimeConfig | null;
  setRuntimeConfigError: (message: string) => void;
  ensureCredentials: () => boolean;
  handleForgetApiKey: () => void;
  appMode: 'vanish' | 'reimagine';
  selectedModel: ImageModel;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  prompt: string;
  maskColor: string;
  enableOutpainting: boolean;
  outpaintPreserve2D: boolean;
  similarityLevel: 'high' | 'medium' | 'low';
  generateDiverseVariants: boolean;
  vanishEnableMultiVariant: boolean;
  vanishVariantsCount: number;
  batchEnableMultiVariant: boolean;
  batchVariantsCount: number;
  enableBatchMerge: boolean;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'ABORTED');
}

function processingErrorMessage(error: unknown, merge = false): string {
  const fallback = merge ? 'حدث خطأ أثناء دمج الصور' : 'حدث خطأ أثناء معالجة الصورة';
  const message = error instanceof Error ? error.message : fallback;
  const serialized = `${message} ${
    typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error)
  }`.toLowerCase();
  const quotaError = ['429', 'quota', 'resource_exhausted', 'exceeded'].some((token) => serialized.includes(token));
  if (!quotaError) return message;
  return 'تجاوزت حصة Google المتاحة. موديلات Gemini للصور تحتاج مشروعًا مدفوعًا ومفعّلًا عليه Billing وحصة متاحة.';
}

export function useImageProcessor(options: ImageProcessorOptions) {
  const {
    items,
    setItems,
    runtimeConfig,
    setRuntimeConfigError,
    ensureCredentials,
    handleForgetApiKey,
    appMode,
    selectedModel,
    imageSize,
    aspectRatio,
    prompt,
    maskColor,
    enableOutpainting,
    outpaintPreserve2D,
    similarityLevel,
    generateDiverseVariants,
    vanishEnableMultiVariant,
    vanishVariantsCount,
    batchEnableMultiVariant,
    batchVariantsCount,
    enableBatchMerge,
  } = options;
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAbortedRef = useRef(false);

  const activeSignal = () => {
    if (!abortControllerRef.current || abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
      isAbortedRef.current = false;
    }
    return abortControllerRef.current.signal;
  };

  const handleForceStop = useCallback(() => {
    isAbortedRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsProcessing(false);
    setItems((previous) => previous
      .filter((item) => !(item.id.startsWith('merged-') && item.status === 'processing'))
      .map((item) => item.status === 'processing'
        ? { ...item, status: 'pending', errorMessage: undefined }
        : item));
  }, [setItems]);

  async function generateSingleVariant(item: BatchItem, index: number, signal: AbortSignal): Promise<string> {
    if (isAbortedRef.current || signal.aborted) throw new Error('ABORTED');
    const maskedImage = appMode === 'reimagine' && !item.maskedImage
      ? item.originalImage
      : item.maskedImage || item.originalImage;
    const originalImage = isOpenAIModel(selectedModel) && item.dalleMaskImage
      ? await toPngImageUrl(item.originalImage)
      : item.originalImage;

    if (!ensureCredentials()) throw new Error('أدخل مفتاح Gemini API للمتابعة.');
    const response = await requestInpaint({
      maskedImage,
      originalImage,
      dalleMaskImage: item.dalleMaskImage,
      prompt: prompt.trim()
        ? generateDiverseVariants ? `${prompt.trim()} (variation ${index + 1})` : prompt.trim()
        : '',
      maskColor: item.maskedImage ? maskColor : undefined,
      model: selectedModel,
      appMode,
      aspectRatio,
      imageSize,
      enableOutpainting,
      outpaintPreserve2D,
      similarityLevel,
    }, signal);

    if (appMode === 'vanish' && !enableOutpainting && item.dalleMaskImage && !signal.aborted) {
      return lockPixelsOutsideMask(item.originalImage, response.resultImage, item.dalleMaskImage);
    }
    return response.resultImage;
  }

  async function generateBatchMerge(images: string[], userPrompt: string, signal: AbortSignal): Promise<string> {
    if (isAbortedRef.current || signal.aborted) throw new Error('ABORTED');
    if (images.length > 14) {
      const chunks: string[][] = [];
      for (let index = 0; index < images.length; index += 12) chunks.push(images.slice(index, index + 12));
      const intermediate = await mapWithConcurrency(chunks, 1, (chunk) => generateBatchMerge(
        chunk,
        `${userPrompt}\nCreate a faithful intermediate group that preserves every supplied product for a later final merge.`,
        signal,
      ));
      const successful = intermediate
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result) => result.value);
      if (successful.length !== chunks.length) {
        const failed = intermediate.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw failed?.reason || new Error('فشل الدمج المرحلي للباتش الكبير.');
      }
      return generateBatchMerge(successful, userPrompt, signal);
    }

    if (!ensureCredentials()) throw new Error('أدخل مفتاح Gemini API للمتابعة.');
    const response = await requestBatchMerge({
      images,
      prompt: userPrompt,
      model: selectedModel,
      aspectRatio,
      imageSize,
      similarityLevel,
    }, signal);
    return response.resultImage;
  }

  const processImage = async (item: BatchItem) => {
    if (appMode === 'vanish' && !item.maskedImage) return;
    if (appMode === 'reimagine' && !item.originalImage) return;
    const signal = activeSignal();
    setItems((previous) => previous.map((candidate) => candidate.id === item.id
      ? { ...candidate, status: 'processing', errorMessage: undefined }
      : candidate));

    try {
      const isBatch = appMode === 'reimagine';
      const multiVariant = isBatch ? batchEnableMultiVariant : vanishEnableMultiVariant;
      const count = multiVariant ? (isBatch ? batchVariantsCount : vanishVariantsCount) : 1;
      const results = await mapWithConcurrency(
        Array.from({ length: count }, (_value, index) => index),
        isBatch ? 1 : Math.min(2, runtimeConfig?.maxBatchConcurrency || 2),
        (index) => item.inputImages && item.inputImages.length > 1
          ? generateBatchMerge(item.inputImages, prompt, signal)
          : generateSingleVariant(item, index, signal),
      );
      if (isAbortedRef.current || signal.aborted) throw new Error('ABORTED');
      const variants = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled' && Boolean(result.value))
        .map((result) => result.value);
      if (variants.length === 0) {
        const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        throw failed?.reason || new Error('فشلت جميع محاولات توليد الصور المقترحة.');
      }
      setItems((previous) => previous.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: 'completed', resultImage: variants[0], variants, activeVariantIndex: 0 }
        : candidate));
    } catch (error) {
      if (isAbort(error) || isAbortedRef.current) {
        setItems((previous) => previous.map((candidate) => candidate.id === item.id
          ? { ...candidate, status: 'pending', errorMessage: undefined }
          : candidate));
        return;
      }
      if (error instanceof Error && ['API_KEY_REQUIRED', 'API_KEY_INVALID'].includes(error.name)) {
        handleForgetApiKey();
      }
      console.error('Inpainting error:', error);
      setItems((previous) => previous.map((candidate) => candidate.id === item.id
        ? { ...candidate, status: 'error', errorMessage: processingErrorMessage(error) }
        : candidate));
    }
  };

  const processAll = async () => {
    if (!runtimeConfig) {
      setRuntimeConfigError('إعدادات الخادم لم تكتمل بعد. انتظر لحظة ثم أعد المحاولة.');
      return;
    }
    if (!ensureCredentials()) return;
    if (enableBatchMerge && isOpenAIModel(selectedModel)) {
      window.alert('دمج صور الباتش متاح حاليًا مع موديلات Gemini فقط.');
      return;
    }

    isAbortedRef.current = false;
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setIsProcessing(true);
    try {
      if (appMode === 'reimagine' && enableBatchMerge) {
        const images = items.map((item) => item.originalImage || item.maskedImage).filter(Boolean) as string[];
        if (images.length === 0) return;
        const mergedId = `merged-${Date.now()}`;
        setItems((previous) => [{
          id: mergedId,
          initialImage: images[0],
          originalImage: images[0],
          inputImages: images,
          editHistory: [images[0]],
          maskedImage: null,
          resultImage: null,
          status: 'processing',
        }, ...previous]);
        try {
          const count = batchEnableMultiVariant ? Math.max(1, batchVariantsCount) : 1;
          const results = await mapWithConcurrency(
            Array.from({ length: count }, (_value, index) => index),
            runtimeConfig.maxBatchConcurrency,
            () => generateBatchMerge(images, prompt, signal),
          );
          if (isAbortedRef.current || signal.aborted) throw new Error('ABORTED');
          const variants = results
            .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled' && Boolean(result.value))
            .map((result) => result.value);
          if (variants.length === 0) {
            const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
            throw failed?.reason || new Error('فشل توليد أي بديل لدمج الصور.');
          }
          setItems((previous) => previous.map((item) => item.id === mergedId
            ? { ...item, status: 'completed', resultImage: variants[0], variants, activeVariantIndex: 0 }
            : item));
        } catch (error) {
          if (isAbort(error) || isAbortedRef.current) {
            setItems((previous) => previous.filter((item) => item.id !== mergedId));
            return;
          }
          if (error instanceof Error && ['API_KEY_REQUIRED', 'API_KEY_INVALID'].includes(error.name)) {
            handleForgetApiKey();
          }
          console.error('Batch Merge Error:', error);
          setItems((previous) => previous.map((item) => item.id === mergedId
            ? { ...item, status: 'error', errorMessage: processingErrorMessage(error, true) }
            : item));
        }
        return;
      }

      const pendingItems = items.filter((item) => {
        const pending = item.status === 'pending' || item.status === 'error';
        return appMode === 'reimagine' ? pending : pending && Boolean(item.maskedImage);
      });
      if (appMode === 'reimagine') {
        await mapWithConcurrency(pendingItems, runtimeConfig.maxBatchConcurrency, processImage);
      } else {
        for (const item of pendingItems) {
          if (isAbortedRef.current) break;
          await processImage(item);
        }
      }
    } finally {
      setIsProcessing(false);
      if (abortControllerRef.current?.signal === signal) abortControllerRef.current = null;
    }
  };

  return { isProcessing, processImage, processAll, handleForceStop };
}
