import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Download, Loader2, Settings2, Trash2, X, Pencil, Check, ChevronUp, ChevronDown, StopCircle, Archive, RotateCcw, FileArchive, FolderArchive, Clock, Layers, Save, CheckCircle, Sparkles, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import CanvasWorkspace from './components/CanvasWorkspace';
import CropModal from './components/CropModal';
import BatchGrid from './components/BatchGrid';
import ImageLightbox from './components/ImageLightbox';
import AspectRatioSelector from './components/AspectRatioSelector';
import ApiKeyDialog from './components/ApiKeyDialog';
import ArchiveSidebar from './components/ArchiveSidebar';
import AppHeader from './components/AppHeader';
import VanishToolbar from './components/VanishToolbar';
import { cn } from './lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { BatchItem } from './types';
import type { AspectRatio, ImageModel, ImageSize } from './shared/models';
import { GEMINI_IMAGE_MODELS, isOpenAIModel, isSupportedAspectRatio, supportsImageSize } from './shared/models';
import { filesToBatchItems, filenameForDataUrl, MAX_BATCH_IMAGES } from './lib/images';
import { acceptItemResult, applyImageEdit, redoItem, undoItem } from './lib/items';
import { useManagedImageLifecycle } from './hooks/useManagedImageLifecycle';
import { useRuntimeCredentials } from './hooks/useRuntimeCredentials';
import { usePresets } from './hooks/usePresets';
import { usePersistentWorkspace } from './hooks/usePersistentWorkspace';
import { useImageProcessor } from './hooks/useImageProcessor';
import {
  loadAllSessions, 
  saveWorkSession, 
  deleteWorkSession, 
  clearAllWorkSessions, 
  clearDatabase,
  type WorkSession,
} from './lib/db';

const ITEM_STATUS_LABEL: Record<BatchItem['status'], string> = {
  pending: 'بانتظار التحديد',
  processing: 'جارٍ التوليد',
  completed: 'مكتملة',
  error: 'تحتاج إعادة محاولة',
};

export default function App() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem = items.find(i => i.id === activeItemId);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'pan' | 'rect' | 'wand'>('brush');
  const [brushSize, setBrushSize] = useState(40);
  const [brushHardness, setBrushHardness] = useState(100);
  const [wandTolerance, setWandTolerance] = useState(30);
  const [vanishEnableMultiVariant, setVanishEnableMultiVariant] = useState(false);
  const [vanishVariantsCount, setVanishVariantsCount] = useState(3);
  const [batchEnableMultiVariant, setBatchEnableMultiVariant] = useState(false);
  const [batchVariantsCount, setBatchVariantsCount] = useState(2);
  const [enableBatchMerge, setEnableBatchMerge] = useState(false);
  const [maskColor, setMaskColor] = useState('#00FF00');
  const [prompt, setPrompt] = useState('');
  const [selectedPresetName, setSelectedPresetName] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ImageModel>(() => {
    try {
      const saved = localStorage.getItem('vanishai_selected_model');
      if (saved && (GEMINI_IMAGE_MODELS as readonly string[]).includes(saved)) {
        return saved as ImageModel;
      }
    } catch (e) {
      console.error(e);
    }
    return 'gemini-3.1-flash-lite-image';
  });

  useEffect(() => {
    try {
      localStorage.setItem('vanishai_selected_model', selectedModel);
    } catch (e) {
      console.error(e);
    }
  }, [selectedModel]);
  const [imageSize, setImageSize] = useState<ImageSize>(() => {
    const saved = localStorage.getItem('vanishai_image_size');
    return saved === '2K' || saved === '4K' ? saved : '1K';
  });

  useEffect(() => {
    localStorage.setItem('vanishai_image_size', imageSize);
  }, [imageSize]);
  useEffect(() => {
    // Gemini keeps its native/default output like the original AI Studio build.
    // Resolution selection remains available only for external OpenAI models.
    if (!isOpenAIModel(selectedModel) || !supportsImageSize(selectedModel, imageSize)) setImageSize('1K');
  }, [selectedModel, imageSize]);
  const [enableOutpainting, setEnableOutpainting] = useState(false);
  const [outpaintPreserve2D, setOutpaintPreserve2D] = useState(true);
  const [similarityLevel, setSimilarityLevel] = useState<'high' | 'medium' | 'low'>('high');
  const [generateDiverseVariants, setGenerateDiverseVariants] = useState(false);
  const [showBrushPanel, setShowBrushPanel] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const {
    runtimeConfig,
    runtimeConfigError,
    setRuntimeConfigError,
    showApiKeyDialog,
    setShowApiKeyDialog,
    hasUserApiKey,
    requiresUserApiKey,
    managedGeminiMode,
    ensureCredentials,
    handleSaveApiKey,
    handleForgetApiKey,
  } = useRuntimeCredentials();
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null);
  const lightboxItem = items.find(i => i.id === lightboxItemId);
  const lightboxItemIdx = items.findIndex(i => i.id === lightboxItemId);
  const [appMode, setAppMode] = useState<'vanish' | 'reimagine'>('vanish');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    try {
      const saved = localStorage.getItem('vanishai_aspect_ratio');
      if (saved && isSupportedAspectRatio(saved)) {
        return saved;
      }
    } catch (e) {
      console.error(e);
    }
    return 'original';
  });

  useEffect(() => {
    try {
      localStorage.setItem('vanishai_aspect_ratio', aspectRatio);
    } catch (e) {
      console.error(e);
    }
  }, [aspectRatio]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [archiveTab, setArchiveTab] = useState<'sessions' | 'images'>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => 'session_' + Date.now());
  const currentSessionCreatedAtRef = useRef<number>(Date.now());
  const { dbItems, setDbItems, sessions, setSessions } = usePersistentWorkspace(
    items,
    currentSessionId,
    currentSessionCreatedAtRef,
  );
  const [showDbSidebar, setShowDbSidebar] = useState(false);
  const [showReimagineSidebar, setShowReimagineSidebar] = useState(true);
  const [showVanishAdvanced, setShowVanishAdvanced] = useState(false);
  const [showVanishSystemSettings, setShowVanishSystemSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchItemCountRef = useRef(0);

  useEffect(() => {
    batchItemCountRef.current = items.length;
  }, [items.length]);

  useManagedImageLifecycle(items, dbItems, sessions);

  const [quickPreviewImage, setQuickPreviewImage] = useState<string | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);
  const blockClickRef = useRef<boolean>(false);

  const [isZipDownloading, setIsZipDownloading] = useState(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const { isProcessing, processImage, processAll, handleForceStop } = useImageProcessor({
    items,
    setItems,
    runtimeConfig,
    setRuntimeConfigError,
    ensureCredentials,
    handleForgetApiKey,
    managedGeminiMode,
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
  });

  const handleItemPressStart = (e: any, itemOriginalImage: string) => {
    isLongPressActiveRef.current = false;
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    
    longPressTimeoutRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      blockClickRef.current = true;
      setQuickPreviewImage(itemOriginalImage);
    }, 450); // 450ms for long press hold threshold
  };

  const handleItemPressEnd = (e: any) => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    setQuickPreviewImage(null);
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      setTimeout(() => {
        blockClickRef.current = false;
      }, 100);
    }
  };

  const handleItemClick = (e: any, item: BatchItem) => {
    if (blockClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setActiveItemId(item.id);
    if (window.innerWidth < 1024) {
      setShowSidebar(false);
    }
  };

  const createLongPressHandlers = (item: BatchItem) => {
    return {
      onMouseDown: (e: any) => {
        if (e.button !== 0) return; // Only left click
        handleItemPressStart(e, item.originalImage);
      },
      onMouseUp: (e: any) => handleItemPressEnd(e),
      onMouseLeave: (e: any) => handleItemPressEnd(e),
      onTouchStart: (e: any) => {
        handleItemPressStart(e, item.originalImage);
      },
      onTouchEnd: (e: any) => handleItemPressEnd(e),
      onTouchCancel: (e: any) => handleItemPressEnd(e),
      onClick: (e: any) => {
        handleItemClick(e, item);
      },
      onContextMenu: (e: any) => {
        e.preventDefault();
      }
    };
  };

  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const {
    presets,
    newPresetName,
    setNewPresetName,
    newPresetPrompt,
    setNewPresetPrompt,
    showAddPresetFormSidebar,
    setShowAddPresetFormSidebar,
    editingPresetIndex,
    editingPresetName,
    setEditingPresetName,
    editingPresetPrompt,
    setEditingPresetPrompt,
    activePreset,
    activePromptTitle,
    handleStartEditPreset,
    handleSaveEditPreset,
    handleCancelEditPreset,
    handleMovePreset,
    handleAddPreset,
    handleDeletePreset,
    handleResetPresets,
  } = usePresets(prompt, selectedPresetName);

  const handleDeleteFromDb = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setDbItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddFromDbToActive = (item: BatchItem) => {
    // Check if it's already in items to avoid duplicates
    if (!items.some(i => i.id === item.id)) {
      if (items.length >= MAX_BATCH_IMAGES) {
        window.alert(`مساحة العمل تحتوي بالفعل على ${MAX_BATCH_IMAGES} صورة. احذف صورة أولًا.`);
        return;
      }
      setItems(prev => [item, ...prev]);
      setActiveItemId(item.id);
    } else {
      setActiveItemId(item.id);
    }
  };

  // Restore all images from archive into the active batch workspace
  const handleRestoreAllArchiveImages = () => {
    if (dbItems.length === 0) return;
    setItems(prev => {
      const existingIds = new Set(prev.map(i => i.id));
      const toAdd = dbItems.filter(i => !existingIds.has(i.id));
      const newItems = [...toAdd, ...prev].slice(0, MAX_BATCH_IMAGES);
      if (!activeItemId && newItems.length > 0) {
        setActiveItemId(newItems[0].id);
      }
      return newItems;
    });
  };

  // Clear all images from the archive database
  const handleClearAllArchiveImages = async () => {
    if (!window.confirm('هل تريد حذف كل الصور من المكتبة؟ لن تُحذف الصور المفتوحة حاليًا من مساحة العمل.')) return;
    setDbItems([]);
    await clearDatabase();
  };

  // Restore a specific saved work session
  const handleRestoreSession = (session: WorkSession) => {
    if (!session.items || session.items.length === 0) return;
    setItems([...session.items]);
    setCurrentSessionId(session.id);
    currentSessionCreatedAtRef.current = session.createdAt || Date.now();
    setActiveItemId(session.items[0]?.id || null);
    setShowSidebar(true);
    setShowDbSidebar(false);
  };

  // Delete a specific work session manually
  const handleDeleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!window.confirm('حذف نقطة الرجوع هذه نهائيًا؟')) return;
    await deleteWorkSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (sessionId === currentSessionId) {
      setCurrentSessionId('session_' + Date.now());
      currentSessionCreatedAtRef.current = Date.now();
    }
  };

  // Clear all saved sessions manually
  const handleClearAllSessions = async () => {
    if (!window.confirm('هل تريد حذف كل جلسات الرجوع المحفوظة؟ الصور الموجودة في مساحة العمل لن تتأثر.')) return;
    await clearAllWorkSessions();
    setSessions([]);
    setCurrentSessionId('session_' + Date.now());
    currentSessionCreatedAtRef.current = Date.now();
  };

  // Create a fresh new work session checkpoint
  const handleSaveCurrentSessionNow = async () => {
    if (items.length === 0) return;
    const newSessionId = 'session_' + Date.now();
    const previewThumbnails = items.slice(0, 4).map(i => i.resultImage || i.originalImage);
    const sessionObj: WorkSession = {
      id: newSessionId,
      name: `جلسة عمل محفوظة (${items.length} صورة)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      itemCount: items.length,
      completedCount: items.filter(i => i.status === 'completed').length,
      previewThumbnails,
      items: [...items]
    };
    setCurrentSessionId(newSessionId);
    currentSessionCreatedAtRef.current = Date.now();
    await saveWorkSession(sessionObj);
    const updated = await loadAllSessions();
    setSessions(updated);
  };

  useEffect(() => {
    // Hide sidebar on small mobile/tablet screens initially to maintain drawing space
    if (window.innerWidth < 1024) {
      setShowSidebar(false);
    }
  }, []);

  const addImageFiles = useCallback(async (files: File[]) => {
    const availableSlots = Math.max(0, MAX_BATCH_IMAGES - batchItemCountRef.current);
    if (availableSlots === 0) {
      window.alert(`الدفعة الحالية وصلت للحد الأقصى: ${MAX_BATCH_IMAGES} صورة.`);
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const skippedForCapacity = Math.max(0, files.length - selectedFiles.length);
    batchItemCountRef.current += selectedFiles.length;
    const { items: loadedItems, failedFiles } = await filesToBatchItems(selectedFiles, uuidv4);
    batchItemCountRef.current -= selectedFiles.length - loadedItems.length;
    if (loadedItems.length > 0) {
      setItems((previousItems) => [...loadedItems, ...previousItems]);
      setActiveItemId(loadedItems[0].id);
    }
    if (failedFiles.length > 0 || skippedForCapacity > 0) {
      console.error('Failed image files:', failedFiles);
      const parts = [
        failedFiles.length > 0 ? `تعذر تحميل ${failedFiles.length} ملف غير مدعوم أو أكبر من 45MB.` : '',
        skippedForCapacity > 0 ? `تم تجاوز ${skippedForCapacity} ملف لأن الحد الأقصى للدفعة ${MAX_BATCH_IMAGES} صورة.` : '',
      ].filter(Boolean);
      window.alert(parts.join('\n'));
    }
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // If user is actively typing in a standard text field, let them paste text normally, Unless there are files.
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        if (!e.clipboardData || !e.clipboardData.files || e.clipboardData.files.length === 0) {
          return;
        }
      }

      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const files = Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/'));
        if (files.length === 0) return;

        e.preventDefault();
        void addImageFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addImageFiles]);

  const vanishSteps = [
    "جاري تحليل تفاصيل الصورة وأبعاد العناصر...",
    "جاري استخراج قناع التحديد والبدء في مطابقة المحيط...",
    "جاري مطابقة درجات الإضاءة والألوان والخلفية بطريقة ذكية...",
    "جاري إخفاء الكائنات المختارة وإعادة بناء التفاصيل المخفية...",
    "جاري تحسين الجودة ودمج التغييرات بشكل طبيعي..."
  ];

  const reimagineSteps = [
    "جاري تحليل البنية الأساسية ومحتويات الصورة المصدر...",
    "جاري تفكيك الألوان وتحديد نمط التوليد والطلب المطلوب...",
    "جاري استخدام نموذج الذكاء الاصطناعي لإعادة تصور المشهد وجودته...",
    "جاري إضافة تفاصيل دقيقة، تباين احترافي وتحسين الكواليتي...",
    "جاري إنتاج النتيجة النهائية بالأبعاد والأسلوب المختار..."
  ];

  const processingSteps = appMode === 'reimagine' ? reimagineSteps : vanishSteps;

  useEffect(() => {
    let interval: any;
    if (activeItem?.status === 'processing') {
      setActiveStepIndex(0);
      interval = setInterval(() => {
        setActiveStepIndex(prev => (prev + 1) % processingSteps.length);
      }, 2500);
    } else {
      setActiveStepIndex(0);
    }
    return () => clearInterval(interval);
  }, [activeItem?.status]);

  const handleToolClick = (selectedTool: 'brush' | 'eraser' | 'pan' | 'rect' | 'wand') => {
    setTool(selectedTool);
  };

  const handleToolContextMenu = (e: React.MouseEvent, selectedTool: 'brush' | 'eraser' | 'pan' | 'rect' | 'wand') => {
    e.preventDefault();
    setTool(selectedTool);
    setShowBrushPanel(!showBrushPanel);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.code === 'BracketLeft') {
        setBrushSize(prev => Math.max(1, prev - 5));
      } else if (e.code === 'BracketRight') {
        setBrushSize(prev => Math.min(200, prev + 5));
      } else {
        const keyLower = e.key ? e.key.toLowerCase() : '';
        const isKeyB = e.code === 'KeyB' || keyLower === 'b' || e.key === 'ب' || e.key === 'ل' || e.key === 'لا';
        const isKeyE = e.code === 'KeyE' || keyLower === 'e' || e.key === 'ث' || e.key === 'إ' || e.key === 'ا';
        const isKeyM = e.code === 'KeyM' || keyLower === 'm' || e.key === 'ة' || e.key === 'م';
        const isKeyW = e.code === 'KeyW' || keyLower === 'w' || e.key === 'ص';

        if (isKeyB) {
          if (e.shiftKey) {
            setShowBrushPanel(!showBrushPanel);
          } else {
            setTool('brush');
          }
        } else if (isKeyE) {
          if (e.shiftKey) {
            setShowBrushPanel(!showBrushPanel);
          } else {
            setTool('eraser');
          }
        } else if (isKeyM) {
          if (e.shiftKey) {
            setShowBrushPanel(!showBrushPanel);
          } else {
            setTool('rect');
          }
        } else if (isKeyW) {
          if (e.shiftKey) {
            setShowBrushPanel(!showBrushPanel);
          } else {
            setTool('wand');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, showBrushPanel]);

  const handleUndoEdit = () => {
    if (!activeItem || activeItem.editHistory.length === 0) return;
    setItems(prev => prev.map(i => i.id === activeItem.id ? undoItem(i) : i));
    setClearTrigger(c => c + 1);
  };

  const handleRedoEdit = () => {
    if (!activeItem || !activeItem.redoEditHistory || activeItem.redoEditHistory.length === 0) return;
    setItems(prev => prev.map(i => i.id === activeItem.id ? redoItem(i) : i));
    setClearTrigger(c => c + 1);
  };

  const handleDeleteItem = useCallback((id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const wasActive = activeItemId === id;
    setItems(prev => {
      const filtered = prev.filter(item => item.id !== id);
      if (wasActive) {
        if (filtered.length > 0) {
          setActiveItemId(filtered[0].id);
        } else {
          setActiveItemId(null);
        }
      }
      return filtered;
    });
  }, [activeItemId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      if (files.length === 0) return;

      void addImageFiles(files);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
      if (files.length === 0) return;

      void addImageFiles(files);
      e.target.value = '';
    }
  };

  const handleMaskChange = useCallback((dataUrl: string, dalleMaskUrl?: string, maskOverlayUrl?: string) => {
    if (activeItemId) {
      setItems(prev => prev.map(item => 
        item.id === activeItemId ? {
          ...item,
          maskedImage: dataUrl || null,
          dalleMaskImage: dalleMaskUrl || null,
          maskOverlayImage: maskOverlayUrl || null,
          status: item.status === 'error' ? 'pending' : item.status,
        } : item
      ));
    }
  }, [activeItemId]);

  const handleCropComplete = (croppedImageUrl: string) => {
    if (activeItemId) {
      setItems((previous) => previous.map((item) => (
        item.id === activeItemId ? applyImageEdit(item, croppedImageUrl) : item
      )));
    }
    setShowCropModal(false);
  };

  const handleDownload = useCallback((dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filenameForDataUrl(filename, dataUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const downloadAllSequential = () => {
    setShowDownloadMenu(false);
    const completedItems = items.filter(item => item.status === 'completed' && (item.resultImage || item.originalImage));
    if (completedItems.length === 0) return;
    
    completedItems.forEach((item, index) => {
      setTimeout(() => {
        handleDownload(item.resultImage || item.originalImage, `vanishai-batch-${item.id.slice(0, 6)}.jpg`);
      }, index * 350); // small delay to avoid browser download blocking
    });
  };

  const downloadAllCompleted = downloadAllSequential;

  const downloadAllAsZip = async () => {
    const completedItems = items.filter(item => item.status === 'completed' && (item.resultImage || item.originalImage));
    if (completedItems.length === 0) return;

    setShowDownloadMenu(false);
    setIsZipDownloading(true);
    setZipProgress(5);

    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const folder = zip.folder("vanishai_results") || zip;

      for (let i = 0; i < completedItems.length; i++) {
        const item = completedItems[i];
        const imageUrl = item.resultImage || item.originalImage;
        
        try {
          const resp = await fetch(imageUrl);
          if (!resp.ok) throw new Error('Unable to read image');
          const blob = await resp.blob();
          const buffer = await blob.arrayBuffer();
          const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
          const fileName = `vanishai_image_${i + 1}_${item.id.slice(0, 6)}.${ext}`;
          folder.file(fileName, buffer);
        } catch (e) {
          console.error("Error fetching image for zip:", e);
        }
        setZipProgress(Math.round(((i + 1) / completedItems.length) * 75));
      }

      setZipProgress(80);
      const zipBlob = await zip.generateAsync(
        { 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        },
        (metadata) => {
          setZipProgress(80 + Math.round(metadata.percent * 0.2));
        }
      );

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vanishai_batch_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("ZIP Generation error:", error);
      alert("حدث خطأ أثناء تجميع ملف الـ ZIP. يمكنك استخدام خيار التحميل التتابعي الفردي.");
    } finally {
      setIsZipDownloading(false);
      setZipProgress(0);
    }
  };

  const handleUndoAllBatch = () => {
    if (!window.confirm('هل تريد التراجع عن كل نتائج وتعديلات الدفعة وإعادتها للصور الأصلية؟')) return;
    // Revert all modified items to their original initial state
    setItems(prev => prev.map(item => {
      const initial = item.initialImage || (item.editHistory && item.editHistory.length > 0 ? item.editHistory[0] : item.originalImage);
      return {
        ...item,
        originalImage: initial,
        initialImage: initial,
        resultImage: null,
        maskedImage: null,
        dalleMaskImage: null,
        maskOverlayImage: null,
        editHistory: [],
        redoEditHistory: [],
        variants: undefined,
        activeVariantIndex: undefined,
        status: 'pending',
        errorMessage: undefined
      };
    }));
    setClearTrigger(c => c + 1);
  };

  const clearAllBatch = () => {
    if (items.length > 0 && !window.confirm(`حذف كل صور الدفعة الحالية (${items.length}) من مساحة العمل؟`)) return;
    setItems([]);
    setActiveItemId(null);
  };

  return (
    <div 
      className="min-h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden flex flex-col relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {runtimeConfigError && (
        <div className="fixed left-1/2 top-3 z-[90] -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-950/95 px-4 py-2 text-xs text-amber-200 shadow-xl" dir="rtl">
          {runtimeConfigError}
        </div>
      )}
      <AnimatePresence>
        {isDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex items-center justify-center border-4 border-blue-500 border-dashed"
          >
            <div className="text-3xl font-bold text-white flex flex-col items-center gap-4">
              <Upload size={48} />
              أفلت الصور هنا
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AppHeader
        appMode={appMode}
        onModeChange={(mode) => {
          setAppMode(mode);
          if (mode === 'vanish') setTool('brush');
        }}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        imageSize={imageSize}
        onImageSizeChange={setImageSize}
        openaiAvailable={Boolean(runtimeConfig?.openaiAvailable)}
        requiresUserApiKey={requiresUserApiKey}
        hasUserApiKey={hasUserApiKey}
        onManageApiKey={() => setShowApiKeyDialog(true)}
        hasActiveItem={Boolean(activeItem)}
        onDeleteActive={() => activeItem && handleDeleteItem(activeItem.id)}
        onDownloadActive={() => activeItem && handleDownload(
          activeItem.resultImage || activeItem.originalImage,
          filenameForDataUrl(`vanishai-${activeItem.id}`, activeItem.resultImage || activeItem.originalImage),
        )}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        isProcessing={isProcessing}
        primaryDisabled={
          !runtimeConfig ||
          (appMode === 'vanish'
            ? !items.some((item) => (item.status === 'pending' || item.status === 'error') && Boolean(item.maskedImage))
            : enableBatchMerge
              ? items.length === 0
              : !items.some((item) => item.status === 'pending' || item.status === 'error'))
        }
        isMergeMode={appMode === 'reimagine' && enableBatchMerge}
        onProcess={() => void processAll()}
        onStop={handleForceStop}
        optionsOpen={showReimagineSidebar}
        onToggleOptions={() => setShowReimagineSidebar((open) => !open)}
        queueOpen={showSidebar}
        onToggleQueue={() => setShowSidebar((open) => !open)}
        itemCount={items.length}
        archiveOpen={showDbSidebar}
        onToggleArchive={() => setShowDbSidebar((open) => !open)}
        archiveCount={dbItems.length}
      />
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {appMode === 'vanish' && (
          <VanishToolbar
            tool={tool}
            onToolChange={handleToolClick}
            onToolOptions={handleToolContextMenu}
            hasActiveItem={Boolean(activeItem)}
            hasMask={Boolean(activeItem?.maskedImage)}
            hasResult={Boolean(activeItem?.resultImage)}
            hasComparison={Boolean(activeItem?.resultImage || (activeItem && activeItem.originalImage !== activeItem.initialImage))}
            canUndoImageEdit={Boolean(activeItem?.editHistory.length)}
            canRedoImageEdit={Boolean(activeItem?.redoEditHistory?.length)}
            isProcessing={isProcessing}
            onCrop={() => setShowCropModal(true)}
            onClearMask={() => setClearTrigger((trigger) => trigger + 1)}
            onDownload={() => activeItem && handleDownload(
              activeItem.resultImage || activeItem.originalImage,
              `vanishai-${activeItem.id}`,
            )}
            onCompareStart={() => setIsComparing(true)}
            onCompareEnd={() => setIsComparing(false)}
            onUndoImageEdit={handleUndoEdit}
            onRedoImageEdit={handleRedoEdit}
            settingsOpen={showBrushPanel}
            onToggleSettings={() => setShowBrushPanel((open) => !open)}
          />
        )}

        {/* Properties Panel (Floating) */}
        <AnimatePresence>
          {activeItem && showBrushPanel && appMode === 'vanish' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-16 lg:bottom-auto left-4 lg:left-24 right-4 lg:right-auto lg:top-6 lg:w-80 max-h-[70vh] lg:max-h-[80vh] overflow-y-auto bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl z-[45] animate-in fade-in duration-200 font-sans"
            >
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
                  <Settings2 className="w-4 h-4 text-orange-400" />
                  <span>لوحة الخيارات الذكية</span>
                </div>
                <span className="text-[10px] bg-orange-500/15 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/20 font-bold">VanishAI Pro</span>
              </div>

              <div className="space-y-4">
                {/* Brush & Wand Controls - always available for masking */}
                <div className="space-y-3 bg-black/20 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between text-[11px] text-neutral-300 font-bold">
                    <span>{tool === 'wand' ? '⚙️ إعدادات عصا التحديد' : '🖌️ إعدادات الفرشاة والمسح'}</span>
                    <span className="text-[9px] text-neutral-500 font-normal">اختياري</span>
                  </div>

                  {(tool === 'brush' || tool === 'eraser') && (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-neutral-400">
                          <span>حجم الفرشاة</span>
                          <span className="font-mono text-orange-400 font-semibold">{brushSize}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="200" 
                          value={brushSize} 
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-full accent-orange-500 cursor-pointer"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-neutral-400">
                          <span>صلابة الحواف</span>
                          <span className="font-mono text-orange-400 font-semibold">{brushHardness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={brushHardness} 
                          onChange={(e) => setBrushHardness(Number(e.target.value))}
                          className="w-full accent-orange-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {tool === 'wand' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-neutral-400">
                        <span className="font-sans font-medium">دقة التحديد (Tolerance)</span>
                        <span className="font-mono text-orange-400 font-bold">{wandTolerance}</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={wandTolerance} 
                        onChange={(e) => setWandTolerance(Number(e.target.value))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex justify-between text-[10px] text-neutral-400 font-sans">
                      <span>Mask Color (لون القناع للتحديد)</span>
                    </div>
                    <div className="flex gap-2 justify-between">
                      {['#00FF00', '#FF00FF', '#FF0000', '#0000FF', '#FFFF00'].map(color => (
                        <button
                          key={color}
                          onClick={() => setMaskColor(color)}
                          className={cn(
                            "w-5 h-5 rounded-full border transition-all",
                            maskColor === color ? "border-white scale-110 ring-2 ring-orange-500/30" : "border-transparent hover:scale-110"
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Generative Outpainting Toggle */}
                <div className="space-y-2 pt-3 border-t border-white/10">
                  <div className="flex justify-between items-center text-xs text-neutral-300">
                    <div className="flex flex-col">
                      <span className="font-bold font-sans">🖼️ التكميل والتوسيع (Generative Fill)</span>
                      <span className="text-[9px] text-neutral-500 font-normal mt-0.5">تعبئة وتمديد هوامش ومحيط الصورة بذكاء</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={enableOutpainting} 
                        onChange={(e) => setEnableOutpainting(e.target.checked)}
                        disabled={isProcessing}
                        className="sr-only peer" 
                      />
                      <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 relative"></div>
                    </label>
                  </div>
                  {enableOutpainting && (
                    <div className="mt-2 p-2.5 bg-neutral-900/60 border border-orange-500/20 rounded-lg space-y-3">
                      <p className="text-[9px] text-orange-400 leading-normal text-right font-sans">
                        💡 ممتاز! قم بتحديد/تلوين المناطق الفارغة أو الهوامش المراد تكميلها (مثال: باللون الأحمر أو الأخضر) وسيقوم الموديل بتوسيع الصورة بذكاء لملئها seamlessly.
                      </p>

                      {/* 2D Design Mode Toggle */}
                      <div className="flex justify-between items-center text-xs text-neutral-300 pt-1.5 border-t border-white/5">
                        <div className="flex flex-col pr-1 text-right">
                          <span className="font-semibold font-sans text-[11px] text-orange-200">📐 الحفاظ على التصميم ثنائي الأبعاد (2D)</span>
                          <span className="text-[9px] text-neutral-500 font-normal mt-0.5">منع تحويل البانر/التصميم إلى واجهات أو مجسمات 3D حقيقية</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={outpaintPreserve2D} 
                            onChange={(e) => setOutpaintPreserve2D(e.target.checked)}
                            disabled={isProcessing}
                            className="sr-only peer" 
                          />
                          <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 relative"></div>
                        </label>
                      </div>

                      {/* Similarity & Variation Selector */}
                      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                        <div className="flex justify-between text-[11px] text-neutral-300 font-sans">
                          <span className="text-[9px] text-neutral-500">معدل الاختلاف بين الخيارات الأربعة</span>
                          <span className="font-semibold text-orange-200">🎯 مستوى التشابه بين النتائج</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 pt-0.5">
                          {[
                            { value: 'high', label: 'طبيعي ومتناسق (تشابه 90%+)', desc: 'تطابق عالٍ جداً' },
                            { value: 'medium', label: 'تنوع متوازن', desc: 'تغييرات خفيفة' },
                            { value: 'low', label: 'إبداعي متنوع', desc: 'تغييرات كاملة' }
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setSimilarityLevel(opt.value as any);
                                if (opt.value === 'high') {
                                  setGenerateDiverseVariants(false);
                                }
                              }}
                              className={`p-1.5 rounded text-center transition-all cursor-pointer flex flex-col items-center justify-center border ${
                                similarityLevel === opt.value
                                  ? 'bg-orange-500/30 border-orange-500 text-white font-semibold'
                                  : 'bg-neutral-800/40 border-neutral-700/60 text-neutral-400 hover:bg-neutral-800'
                              }`}
                            >
                              <span className="text-[10px] font-sans">{opt.label.split(' ')[0]}</span>
                              <span className="text-[8px] opacity-80 mt-0.5">{opt.label.includes('(') ? opt.label.substring(opt.label.indexOf('(')) : opt.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Generate Diverse Variants Toggle */}
                      <div className="flex justify-between items-center text-xs text-neutral-300 pt-1.5 border-t border-white/5">
                        <div className="flex flex-col pr-1 text-right">
                          <span className="font-semibold font-sans text-[11px] text-orange-200">🔀 توليد أفكار مختلفة كلياً لكل بديل</span>
                          <span className="text-[9px] text-neutral-500 font-normal mt-0.5">توجيه كل خيار من الـ 4 لاتجاه فني مختلف</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={generateDiverseVariants} 
                            onChange={(e) => {
                              setGenerateDiverseVariants(e.target.checked);
                              if (e.target.checked) {
                                setSimilarityLevel('low');
                              }
                            }}
                            disabled={isProcessing}
                            className="sr-only peer" 
                          />
                          <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 relative"></div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowVanishAdvanced(!showVanishAdvanced)}
                    className="w-full flex items-center justify-between text-xs font-bold text-neutral-300 hover:text-white transition-colors py-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-sans">
                      <span>✍️ إرشادات وطلب التوليد (برومبت اختياري)</span>
                    </span>
                    <span className="text-orange-400 font-mono text-[10px]">{showVanishAdvanced ? 'إخفاء ▴' : 'توسيع البرومبت ▾'}</span>
                  </button>

                  <AnimatePresence>
                    {showVanishAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-2 pt-1"
                      >
                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="مثال: طاولة خشبية عتيقة... (اتركه فارغاً للمسح والملء التلقائي)"
                          className="w-full bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder:text-neutral-500 resize-none h-20 focus:outline-none focus:border-orange-500 transition-colors leading-relaxed font-sans"
                        />
                        <p className="text-[9px] text-neutral-500 leading-normal text-right font-sans">
                          💡 نصيحة: يمكنك ترك البرومبت فارغاً تماماً وسيقوم الذكاء الاصطناعي بمسح العناصر المحددة تلقائياً بما يطابق تفاصيل الخلفية بذكاء!
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Collapsible System & Connection Settings */}
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowVanishSystemSettings(!showVanishSystemSettings)}
                    className="w-full flex items-center justify-between text-xs font-bold text-neutral-300 hover:text-white transition-colors py-1 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-sans">
                      <span>⚙️ خيارات الاتصال والتوليد المتعدد</span>
                    </span>
                    <span className="text-orange-400 font-mono text-[10px]">{showVanishSystemSettings ? 'إخفاء ▴' : 'توسيع ▾'}</span>
                  </button>

                  <AnimatePresence>
                    {showVanishSystemSettings && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-3 pt-1"
                      >
                        {/* Multi-variant Settings */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-xs text-neutral-400">
                            <span className="font-semibold text-neutral-300 font-sans">التوليد المتعدد (Multi-variant)</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={vanishEnableMultiVariant} 
                                onChange={(e) => setVanishEnableMultiVariant(e.target.checked)}
                                className="sr-only peer" 
                              />
                              <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                          </div>
                          {vanishEnableMultiVariant && (
                            <div className="flex items-center justify-between mt-2 bg-black/30 p-1 rounded-lg border border-white/5">
                              <span className="text-[10px] text-neutral-400">عدد البدائل:</span>
                              <div className="flex gap-1">
                                {[2, 3, 4].map(count => (
                                  <button
                                    key={count}
                                    type="button"
                                    onClick={() => setVanishVariantsCount(count)}
                                    className={cn(
                                      "px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer",
                                      vanishVariantsCount === count 
                                        ? "bg-orange-500 text-white shadow-md shadow-orange-500/15" 
                                        : "text-neutral-400 hover:text-white"
                                    )}
                                  >
                                    {count}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Canvas */}
        {appMode === 'vanish' && (
          <div className="flex-1 relative bg-neutral-950 overflow-hidden p-2 sm:p-6 flex items-center justify-center">
            {items.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="max-w-md w-full border-2 border-dashed border-neutral-800 hover:border-orange-500/40 bg-neutral-900/10 hover:bg-orange-950/5 rounded-3xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer select-none group"
              >
                <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 group-hover:text-orange-400 group-hover:border-orange-500/20 transition-all mb-4 shadow-xl">
                  <Upload className="w-8 h-8 group-hover:scale-110 transition-transform animate-bounce" />
                </div>
                <h4 className="text-base font-bold text-neutral-200 group-hover:text-white transition-colors mb-2 font-sans">قم برفع صورة للبدء في مسح العناصر</h4>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed mb-6 font-sans">
                  قم بسحب وإفلات صورتك هنا أو انقر لاختيارها من جهازك، أو يمكنك إضافة صورة سابقة من معرض الأرشيف في قاعدة البيانات!
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
                  <span className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/10 transition-colors font-sans">
                    اختيار صورة من الجهاز 💻
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDbSidebar(true);
                    }}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-white/10 transition-colors font-sans"
                  >
                    استيراد من الأرشيف 📂
                  </button>
                </div>
              </div>
            ) : (
              <CanvasWorkspace 
                itemId={activeItem?.id || null}
                imageUrl={activeItem?.originalImage || null}
                tool={tool}
                brushSize={brushSize}
                brushHardness={brushHardness}
                wandTolerance={wandTolerance}
                maskColor={maskColor}
                initialMaskUrl={activeItem?.maskOverlayImage}
                onMaskChange={handleMaskChange}
                clearTrigger={clearTrigger}
              />
            )}

            {/* Active Processing Loader Overlay */}
            <AnimatePresence>
              {activeItem?.status === 'processing' && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-40 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="relative mb-6">
                    {/* Outer glowing pulsing ring */}
                    <div className="absolute -inset-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-xl opacity-35 animate-pulse"></div>
                    
                    {/* Rotating modern circular progress */}
                    <div className="w-20 h-20 rounded-full border-4 border-neutral-800 border-t-orange-500 border-r-amber-500 animate-spin flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-1.5 shrink-0 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                    </span>
                    {(() => {
                      if (selectedModel === 'gemini-3.1-flash-image') return "الموديل النشط: 🍌 Nano Banana 2";
                      if (selectedModel === 'gemini-3.1-flash-lite-image') return "الموديل النشط: 🍌 Nano Banana 2 Lite";
                      if (selectedModel === 'gpt-image-2') return "الموديل النشط: OpenAI GPT Image 2";
                      return "الموديل النشط: OpenAI GPT Image 1.5";
                    })()}
                  </h3>
                  
                  <div className="h-10 flex items-center justify-center">
                    <motion.p 
                      key={activeStepIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-sm text-neutral-300 font-medium max-w-sm leading-relaxed"
                    >
                      {processingSteps[activeStepIndex]}
                    </motion.p>
                  </div>
                  
                  <div className="mt-8 flex flex-col items-center gap-3">
                    <button
                      type="button"
                      onClick={handleForceStop}
                      className="px-4 py-2 bg-red-600/90 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-red-600/20 border border-red-400/30 active:scale-95"
                    >
                      <StopCircle className="w-4 h-4 shrink-0" />
                      <span>إيقاف المعالجة فوراً 🛑</span>
                    </button>
                    <div className="flex gap-2 items-center text-[11px] text-neutral-500">
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping"></div>
                      <span>يرجى البقاء في الصفحة حتى اكتمال المعالجة الذكية...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Message Overlay */}
            <AnimatePresence>
              {activeItem?.status === 'error' && (
                <motion.div 
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[calc(100%-2rem)] bg-red-950/90 border border-red-500/30 backdrop-blur-2xl p-4 rounded-2xl shadow-2xl flex items-start gap-3 text-right"
                  dir="rtl"
                >
                  <div className="p-2 rounded-xl bg-red-500/20 text-red-400 shrink-0">
                    <Settings2 className="w-5 h-5 text-red-400" />	
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-red-100">فشل في معالجة التحديـد</h4>
                    <p className="text-xs text-red-200/80 mt-1 leading-normal font-sans">
                      {activeItem.errorMessage || "حدث خطأ غير متوقع أثناء معالجة الصورة مع الموديل المختار."}
                    </p>

                    {/* Smart Advice if Quota is Exhausted */}
                    {activeItem.errorMessage && (
                      activeItem.errorMessage.includes("quota") || 
                      activeItem.errorMessage.includes("429") || 
                      activeItem.errorMessage.includes("RESOURCE_EXHAUSTED") || 
                      activeItem.errorMessage.includes("حصة") || 
                      activeItem.errorMessage.includes("تجاوز")
                    ) && (
                      <div className="mt-3 text-[11px] text-amber-200/95 leading-normal border-t border-red-500/20 pt-2 font-mono bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        💡 <strong>حصة الموديل غير متاحة حاليًا:</strong>
                        <p className="mt-1 font-sans">
                          يرجى الانتظار قليلاً لتجدد الحصة أو إعادة المحاولة لاحقاً.
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex gap-2 justify-start">
                      <button 
                        onClick={() => processImage(activeItem)}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-md shadow-red-500/10 cursor-pointer text-center"
                      >
                        إعادة المحاولة
                      </button>
                      <button 
                        onClick={() => {
                          setItems(prev => prev.map(i => i.id === activeItem.id ? { ...i, status: 'pending', errorMessage: undefined } : i));
                        }}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-semibold transition-colors border border-white/10 cursor-pointer text-center"
                      >
                        تجاهل
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Compare Overlay */}
            <AnimatePresence>
              {isComparing && activeItem && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-2 sm:inset-6 z-30 pointer-events-none flex flex-col items-center justify-center"
                >
                  <img 
                    src={activeItem.initialImage} 
                    alt="Original" 
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10"
                  />
                  <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md border border-white/10">
                    الصورة الأصلية
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Result Overlay */}
            <AnimatePresence>
              {activeItem?.resultImage && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-2 sm:inset-6 flex flex-col items-center justify-center z-20 cursor-pointer"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setLightboxItemId(activeItem.id);
                    }
                  }}
                >
                  <img 
                    src={activeItem.resultImage} 
                    alt="Result" 
                    onClick={() => setLightboxItemId(activeItem.id)}
                    onDoubleClick={() => setLightboxItemId(activeItem.id)}
                    className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/10 cursor-zoom-in hover:scale-[1.01] transition-transform duration-200"
                    title="انقر لمعاينة تفاعلية متقدمة ومقارنة النتيجة بالأصلية 🔍"
                  />
                  <div className="absolute bottom-4 sm:bottom-8 flex flex-col sm:flex-row gap-2 sm:gap-4 bg-neutral-900/95 sm:bg-neutral-900/90 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-2xl w-[calc(100%-2rem)] sm:w-auto max-w-md">
                     <button 
                       onClick={() => {
                         setItems(prev => prev.map(i => i.id === activeItem.id ? acceptItemResult(i) : i));
                         setClearTrigger(c => c + 1);
                       }} 
                       className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-green-500/20 text-center w-full sm:w-auto"
                     >
                       اعتماد ومتابعة التعديل
                     </button>
                     <button 
                       onClick={() => {
                         setItems(prev => prev.map(i => i.id === activeItem.id ? {
                           ...i,
                           resultImage: null,
                           variants: undefined,
                           activeVariantIndex: undefined,
                           status: 'pending'
                         } : i));
                       }} 
                       className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-white/10 text-center w-full sm:w-auto"
                     >
                       تجاهل النتيجة
                     </button>
                     <button 
                       onClick={() => handleDownload(activeItem.resultImage!, `vanishai-${activeItem.id}.jpg`)} 
                       className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 w-full sm:w-auto"
                     >
                       <Download size={16} />
                       تنزيل
                     </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Variants Switcher Panel */}
            {activeItem && activeItem.variants && activeItem.variants.length > 1 && !isComparing && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-35 bg-neutral-900/95 border border-orange-500/30 backdrop-blur-2xl px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3">
                <span className="text-[11px] text-neutral-300 font-sans shrink-0 font-semibold">البدائل المقترحة:</span>
                <div className="flex gap-2">
                  {activeItem.variants.map((variantUrl, idx) => {
                    const isActive = activeItem.activeVariantIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setItems(prev => prev.map(i => i.id === activeItem.id ? {
                            ...i,
                            resultImage: variantUrl,
                            activeVariantIndex: idx
                          } : i));
                        }}
                        className={cn(
                          "relative w-11 h-11 rounded-lg overflow-hidden border transition-all cursor-pointer bg-neutral-950 shrink-0",
                          isActive ? "border-orange-500 scale-110 ring-2 ring-orange-500/20 shadow-md" : "border-white/10 hover:border-white/30"
                        )}
                      >
                        <img src={variantUrl} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-0 right-0 left-0 bg-orange-900/80 text-[8px] text-white text-center py-0.5 font-bold font-mono">
                          {idx + 1}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Sidebar Backdrop Overlay */}
        {appMode === 'vanish' && (
          <AnimatePresence>
            {showSidebar && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSidebar(false)}
                className="fixed inset-0 bg-black/60 z-25 lg:hidden"
              />
            )}
          </AnimatePresence>
        )}

        {/* Batch Queue Sidebar */}
        {appMode === 'vanish' && (
          <AnimatePresence>
            {showSidebar && (
              <motion.div 
                initial={{ x: 320, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 320, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={cn(
                  "w-80 border-l border-white/10 bg-neutral-900/90 backdrop-blur-xl flex flex-col z-30 shrink-0",
                  "fixed lg:static right-0 top-16 bottom-0 shadow-2xl lg:shadow-none h-[calc(100vh-4rem)] lg:h-auto"
                )}
              >
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h2 className="text-sm font-semibold font-sans">قائمة الدفعة ({items.length})</h2>
                  <button 
                    onClick={() => setShowSidebar(false)}
                    className="p-1 px-2.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-xs lg:hidden"
                  >
                    إغلاق ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                  {items.map((item, idx) => {
                    const handlers = createLongPressHandlers(item);
                    return (
                      <div 
                        key={item.id}
                        {...handlers}
                        className={cn(
                          "p-3 rounded-xl border cursor-pointer transition-all flex gap-3 select-none active:scale-[0.985]",
                          activeItemId === item.id 
                            ? "border-orange-500/50 bg-orange-500/10" 
                            : "border-white/5 bg-white/5 hover:bg-white/10"
                        )}
                        title="انقر للاختيار والتعديل، اضغط مطولاً لمعاينة الصورة الأصلية فورا 🔍"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/50 shrink-0 relative">
                          <img src={item.resultImage || item.originalImage} alt="thumbnail" className="w-full h-full object-cover pointer-events-none" />
                          {item.status === 'processing' && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <p className="text-sm font-medium truncate">الصورة {idx + 1}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              item.status === 'completed' ? "bg-green-500" :
                              item.status === 'processing' ? "bg-blue-500" :
                              item.status === 'error' ? "bg-red-500" : "bg-neutral-500"
                            )} />
                            <span className="text-xs text-neutral-400">{ITEM_STATUS_LABEL[item.status]}</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={(e) => handleDeleteItem(item.id, e)}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors self-center border border-red-500/20 cursor-pointer"
                          title="حذف هذه الصورة من القائمة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="text-center py-10 text-sm text-neutral-500">
                      لا توجد صور في قائمة الانتظار
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Batch Mode Widescreen Dashboard */}
        {appMode === 'reimagine' && (
          <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-neutral-950 relative" dir="rtl">
            {/* Mobile Sidebar Backdrop Overlay */}
            <AnimatePresence>
              {showReimagineSidebar && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowReimagineSidebar(false)} 
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden cursor-pointer"
                />
              )}
            </AnimatePresence>

            {/* 1. Control & Settings Sidebar Panel */}
            <AnimatePresence>
              {showReimagineSidebar && (
                <motion.div
                  initial={{ x: window.innerWidth < 1024 ? '100%' : 0, opacity: window.innerWidth < 1024 ? 0.9 : 1 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: window.innerWidth < 1024 ? '100%' : 0, opacity: window.innerWidth < 1024 ? 0.9 : 1 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                  className={cn(
                    "shrink-0 bg-neutral-950 lg:bg-neutral-900/60 p-5 flex flex-col gap-5 overflow-y-auto z-[50] lg:z-auto",
                    // Mobile: sliding drawer on the right. Desktop: static column on the right
                    "fixed lg:static inset-y-0 right-0 w-[85vw] sm:w-[380px] lg:w-96 h-full max-h-full lg:max-h-none border-l border-white/10 shadow-2xl lg:shadow-none"
                  )}
                  style={{ scrollbarWidth: 'thin' }}
                >
                
                {/* Header Title & Mode Toggle */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-orange-500/20 flex items-center justify-center text-orange-400">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white font-sans">المعالجة الجماعية الذكية</h3>
                        <p className="text-[10px] text-neutral-400 font-sans">توليد وصنع الصور في الخلفية بالتوازي</p>
                      </div>
                    </div>

                    {/* Close button for Mobile drawer */}
                    <button
                      type="button"
                      onClick={() => setShowReimagineSidebar(false)}
                      className="lg:hidden p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      title="إغلاق الخيارات"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                {/* Switch back to Vanish Mode button */}
                <button
                  type="button"
                  onClick={() => {
                    setAppMode('vanish');
                    setTool('brush');
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/20 hover:border-orange-500/40 transition-all font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <span>✨ الانتقال لوضع مسح العناصر (الفرشاة)</span>
                </button>
              </div>

              {/* Prompt Input Textarea */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-200 flex items-start justify-between gap-2 font-sans leading-tight">
                  <span className="text-orange-300 leading-snug break-words flex-1">
                    {activePromptTitle}
                  </span>
                  <span className="text-[9px] text-orange-400/80 font-normal shrink-0 pt-0.5">(يُطبق على كافة الصور)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setSelectedPresetName(null);
                  }}
                  placeholder="مثال: أعد إنشاء هذه الصورة بجودة فائقة (Super Resolution) مع تحسين تفاصيل الإضاءة والظلال ورفع حدة الألوان مع إضافة تفاصيل كلين ديجيتال..."
                  disabled={isProcessing}
                  className="w-full h-28 bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-orange-500 transition-colors leading-relaxed font-sans"
                />
              </div>

              {/* Presets Grid */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-neutral-400 font-sans">⚡ أنماط وتأثيرات سريعة بلمسة واحدة:</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowAddPresetFormSidebar(!showAddPresetFormSidebar)}
                      className="text-[10px] text-orange-400 hover:text-orange-300 transition-colors font-bold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>{showAddPresetFormSidebar ? 'إلغاء' : '➕ إضافة'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={handleResetPresets}
                      className="text-[10px] text-neutral-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                      title="استعادة الافتراضي"
                    >
                      🔄
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showAddPresetFormSidebar && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-black/40 border border-orange-500/20 rounded-xl p-2.5 space-y-2 mb-2"
                    >
                      <input
                        type="text"
                        placeholder="اسم النمط (مثال: ✨ دمج الإضاءة)"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                      />
                      <textarea
                        placeholder="وصف البرومبت التفصيلي للنمط..."
                        value={newPresetPrompt}
                        onChange={(e) => setNewPresetPrompt(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white placeholder:text-neutral-500 resize-none h-16 focus:outline-none focus:border-orange-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPreset(newPresetName, newPresetPrompt)}
                        className="w-full py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        حفظ النمط
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {presets.map((p, i) => {
                    const isSelected = activePreset?.name === p.name;
                    return editingPresetIndex === i ? (
                      <div key={i} className="flex flex-col gap-1.5 p-2 rounded-xl bg-orange-950/50 border border-orange-500/40 w-full font-sans my-1">
                        <input
                          type="text"
                          value={editingPresetName}
                          onChange={(e) => setEditingPresetName(e.target.value)}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-orange-500 font-bold"
                          placeholder="اسم النمط..."
                        />
                        <textarea
                          value={editingPresetPrompt}
                          onChange={(e) => setEditingPresetPrompt(e.target.value)}
                          className="w-full h-16 bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-orange-500 leading-relaxed font-sans"
                          placeholder="نص البرومبت..."
                        />
                        <div className="flex items-center justify-end gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={handleCancelEditPreset}
                            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveEditPreset(i)}
                            className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            <span>حفظ التعديل</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={i}
                        className={cn(
                          "group relative flex items-center justify-between rounded-xl border transition-all w-full pl-2 pr-3.5 py-1.5 font-sans",
                          isSelected
                            ? "bg-orange-500/20 border-orange-500/60 shadow-sm shadow-orange-500/10"
                            : "bg-neutral-800/40 hover:bg-orange-500/10 border-white/5 hover:border-orange-500/20"
                        )}
                      >
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => {
                            setPrompt(p.prompt);
                            setSelectedPresetName(p.name);
                          }}
                          className="flex-1 text-right text-xs text-neutral-200 hover:text-orange-200 font-bold cursor-pointer min-w-0 disabled:opacity-50 flex items-center gap-1.5 justify-start"
                          title="تطبيق نص البرومبت مع الاحتفاظ بالأبعاد المحددة"
                        >
                          {isSelected && <span className="text-orange-400 font-black text-xs shrink-0">✓</span>}
                          <span className="block truncate leading-relaxed text-right" dir="rtl">
                            {p.name}
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={isProcessing || i === 0}
                            onClick={(e) => handleMovePreset(i, 'up', e)}
                            className="opacity-50 hover:opacity-100 p-1 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer flex shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
                            title="تحريك لأعلى"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing || i === presets.length - 1}
                            onClick={(e) => handleMovePreset(i, 'down', e)}
                            className="opacity-50 hover:opacity-100 p-1 rounded-lg hover:bg-neutral-700 text-neutral-400 hover:text-white transition-all cursor-pointer flex shrink-0 disabled:opacity-20 disabled:cursor-not-allowed"
                            title="تحريك لأسفل"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={(e) => handleStartEditPreset(i, e)}
                            className="opacity-50 hover:opacity-100 p-1 rounded-lg hover:bg-orange-500/20 text-neutral-400 hover:text-orange-300 transition-all cursor-pointer flex shrink-0 disabled:opacity-30"
                            title="تعديل هذا النمط"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(i);
                            }}
                            className="opacity-50 hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 text-neutral-400 hover:text-red-400 transition-all cursor-pointer flex shrink-0 disabled:opacity-30"
                            title="حذف هذا النمط"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300 font-sans">📐 أبعاد الصورة المطلوبة (Aspect Ratio):</label>
                <AspectRatioSelector
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  disabled={isProcessing}
                />
              </div>

              {/* Batch Merge Option Card */}
              <div className="space-y-3 bg-orange-950/20 p-3 rounded-xl border border-orange-500/25">
                <div className="flex justify-between items-center text-xs text-neutral-300">
                  <div className="flex flex-col">
                    <span className="font-bold font-sans text-orange-200">🧩 دمج كافة صور الباتش في صورة واحدة</span>
                    <span className="text-[9px] text-neutral-400 font-normal mt-0.5">دمج وتجميع العناصر والمنتجات المرفوعة في تكوين سينمائي موحد</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={enableBatchMerge} 
                      onChange={(e) => setEnableBatchMerge(e.target.checked)}
                      disabled={isProcessing}
                      className="sr-only peer" 
                    />
                    <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>
                {enableBatchMerge && (
                  <div className="space-y-1.5 pt-1.5 border-t border-orange-500/15">
                    <p className="text-[10px] text-orange-300/90 leading-relaxed font-sans">
                      ✨ <strong>آلية الدمج التلقائية:</strong> سيتم أخذ جميع الصور المرفوعة في الباتش ({items.length} صور) ودمجها وتنسيق عناصرها معاً بشكل موحد.
                    </p>
                    <p className="text-[9px] text-neutral-400 font-sans">
                      💡 <strong>البرومبت:</strong> يمكنك كتابة برومبت لدمج العناصر في خانة النص بالأعلى، أو تركه فارغاً وسيتم الدمج تلقائياً ببرومبت احترافي.
                    </p>
                  </div>
                )}
              </div>

              {/* Batch Mode Multi-variant Settings (Separate and clear) */}
              <div className="space-y-3 bg-black/20 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center text-xs text-neutral-300">
                  <div className="flex flex-col">
                    <span className="font-bold font-sans">⚙️ خيارات البدائل والكوتا (Multi-variant)</span>
                    <span className="text-[8px] text-neutral-500 font-normal mt-0.5">توليد خيارات متعددة لكل صورة</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={batchEnableMultiVariant} 
                      onChange={(e) => setBatchEnableMultiVariant(e.target.checked)}
                      disabled={isProcessing}
                      className="sr-only peer" 
                    />
                    <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500"></div>
                  </label>
                </div>
                {batchEnableMultiVariant ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between mt-2 bg-black/40 p-1.5 rounded-lg border border-white/5">
                      <span className="text-[10px] text-neutral-400 font-sans">عدد البدائل لكل صورة:</span>
                      <div className="flex gap-1.5">
                        {[2, 3, 4].map(count => (
                          <button
                            key={count}
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setBatchVariantsCount(count)}
                            className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer font-sans",
                              batchVariantsCount === count 
                                ? "bg-orange-500 text-white shadow-md shadow-orange-500/15" 
                                : "text-neutral-400 hover:text-white"
                            )}
                          >
                            {count}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[9px] text-amber-400/80 leading-normal font-sans text-right">
                      ⚠️ تنبيه: تفعيل البدائل في وضع الباتش سيولد {batchVariantsCount} صور لكل ملف، مما قد يستنزف كوتا الـ API بسرعة.
                    </p>
                  </div>
                ) : (
                  <p className="text-[9px] text-green-400/80 leading-normal font-sans text-right">
                    ✅ تم تفعيل توليد صورة واحدة فقط لكل ملف لتوفير كوتا الاستخدام والسرعة القصوى.
                  </p>
                )}
              </div>

              {/* Massive Action Button */}
              <div className="mt-auto pt-4 border-t border-white/5">
                {isProcessing ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 px-4 rounded-xl bg-orange-500/30 text-orange-300 font-bold text-xs flex items-center justify-center gap-2 animate-pulse font-sans"
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                      <span>{enableBatchMerge ? "جاري دمج كافة الصور في صورة واحدة..." : "جاري التوليد بالتوازي حالاً..."}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleForceStop}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-600/90 hover:bg-red-600 text-white font-bold text-xs shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer border border-red-400/30 active:scale-95 font-sans"
                    >
                      <StopCircle className="w-4 h-4 shrink-0" />
                      <span>إيقاف المعالجة إجبارياً 🛑</span>
                    </button>
                    <div className="w-full bg-neutral-900 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-orange-500 h-full animate-pulse" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={processAll}
                    disabled={enableBatchMerge ? items.length === 0 : items.filter(i => i.status === 'pending' || i.status === 'error').length === 0}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 disabled:from-neutral-800 disabled:to-neutral-800 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-orange-500/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.01] font-sans"
                  >
                    <Sparkles className="w-4 h-4 animate-bounce" />
                    <span>{enableBatchMerge ? "دمج كافة الصور في صورة واحدة 🧩" : "تشغيل المعالجة بالتوازي لجميع الصور ⚡"}</span>
                  </button>
                )}
                <p className="text-[9px] text-neutral-500 text-center mt-2 font-medium font-sans">
                  {enableBatchMerge 
                    ? `سيتم دمج جميع الصور الـ (${items.length}) المرفوعة في تكوين واحد` 
                    : `${items.filter(i => i.status === 'pending' || i.status === 'error').length} صور بانتظار التوليد الموازي حالياً`}
                </p>
              </div>

                </motion.div>
              )}
            </AnimatePresence>

            {/* 2. Main Dashboard Panel for Grid & Bulk Actions */}
            <div className="flex-1 p-3 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-y-auto h-full" style={{ scrollbarWidth: 'thin' }}>
              
              {/* Top Banner stats and actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/40 p-4 rounded-2xl border border-white/5 font-sans">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-neutral-400">📊 إحصائيات الدفعة الحالية:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 text-[11px] bg-neutral-950 px-2.5 py-1 rounded-full border border-white/5 font-semibold text-neutral-200 font-mono">
                      <span className="font-sans text-[9px] text-neutral-400">الكل:</span>
                      <span>{items.length}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20 font-semibold text-green-300 font-mono">
                      <span className="font-sans text-[9px] text-green-400">مكتملة:</span>
                      <span>{items.filter(i => i.status === 'completed').length}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20 font-semibold text-orange-300 font-mono">
                      <span className="font-sans text-[9px] text-orange-400">قيد المعالجة:</span>
                      <span>{items.filter(i => i.status === 'processing').length}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] bg-neutral-800 px-2.5 py-1 rounded-full font-semibold text-neutral-400 font-mono">
                      <span className="font-sans text-[9px] text-neutral-500">قيد الانتظار:</span>
                      <span>{items.filter(i => i.status === 'pending').length}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                  {/* Force Stop if processing */}
                  {isProcessing && (
                    <button
                      type="button"
                      onClick={handleForceStop}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20 cursor-pointer animate-pulse border border-red-400/40 shrink-0"
                      title="إيقاف إجباري فوري لجميع العمليات النشطة"
                    >
                      <StopCircle className="w-4 h-4 shrink-0" />
                      <span>إيقاف المعالجة 🛑</span>
                    </button>
                  )}

                  {/* Undo All Edits across entire batch */}
                  {(() => {
                    const modifiedCount = items.filter(i => 
                      !!i.resultImage || 
                      (i.editHistory && i.editHistory.length > 0) || 
                      (i.initialImage && i.initialImage !== i.originalImage) || 
                      !!i.maskedImage ||
                      i.status !== 'pending'
                    ).length;
                    return (
                      <button
                        type="button"
                        onClick={handleUndoAllBatch}
                        disabled={isProcessing || modifiedCount === 0}
                        className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500 hover:text-neutral-950 disabled:opacity-30 disabled:hover:bg-amber-500/10 disabled:hover:text-amber-400 text-amber-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-amber-500/30 cursor-pointer active:scale-95 shrink-0"
                        title="التراجع عن جميع التعديلات والنتائج لكافة الصور والعودة للحالة الأصلية الأولى"
                      >
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                        <span>تراجع عن كل التعديلات {modifiedCount > 0 ? `(${modifiedCount})` : ''}</span>
                      </button>
                    );
                  })()}

                  {/* Download Options: ZIP + Sequential */}
                  {(() => {
                    const completedCount = items.filter(i => i.status === 'completed' && (i.resultImage || i.originalImage)).length;
                    return (
                      <div className="flex items-center gap-1.5">
                        {/* ZIP Archive Download */}
                        <button
                          type="button"
                          onClick={downloadAllAsZip}
                          disabled={completedCount === 0 || isZipDownloading}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer active:scale-95 shrink-0"
                          title="تحميل جميع الصور المكتملة في ملف مضغوط ZIP واحد"
                        >
                          {isZipDownloading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>جاري تجهيز ZIP ({zipProgress}%)...</span>
                            </>
                          ) : (
                            <>
                              <Archive className="w-3.5 h-3.5 shrink-0" />
                              <span>تحميل ZIP ({completedCount})</span>
                            </>
                          )}
                        </button>

                        {/* Sequential Download */}
                        <button
                          type="button"
                          onClick={downloadAllSequential}
                          disabled={completedCount === 0}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/10 cursor-pointer active:scale-95 shrink-0"
                          title="تحميل الصور المكتملة بالتتابع صورة تلو الأخرى"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span>تحميل تتابعي</span>
                        </button>
                      </div>
                    );
                  })()}

                  {/* Clear All */}
                  <button
                    type="button"
                    onClick={clearAllBatch}
                    disabled={isProcessing || items.length === 0}
                    className="p-2 bg-red-500/15 hover:bg-red-600 hover:text-white disabled:opacity-40 text-red-400 rounded-xl transition-all border border-red-500/30 cursor-pointer flex items-center justify-center gap-1.5 w-full sm:w-auto text-xs font-bold shrink-0"
                    title="تفريغ قائمة الباتش بالكامل"
                  >
                    <Trash2 className="w-4 h-4 shrink-0 text-red-400 group-hover:text-white" />
                    <span className="sm:hidden">تفريغ الدفعة</span>
                  </button>
                </div>
              </div>

              {/* Grid of images or Empty Upload State */}
              {items.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-h-[350px] border-2 border-dashed border-neutral-800 hover:border-orange-500/40 bg-neutral-900/10 hover:bg-orange-950/5 rounded-3xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer select-none group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 group-hover:text-orange-400 group-hover:border-orange-500/20 transition-all mb-4 shadow-xl">
                    <Upload className="w-8 h-8 group-hover:scale-110 transition-transform animate-bounce" />
                  </div>
                  <h4 className="text-base font-bold text-neutral-200 group-hover:text-white transition-colors mb-2 font-sans">قم برفع صور المعالجة الجماعية (Batch)</h4>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed mb-6 font-sans">
                    ارفع حتى 100 صورة مرة واحدة. تُحفظ الصور كملفات خفيفة في الذاكرة وتدخل طابور معالجة متدرج لمنع تهنيج المتصفح أو استهلاك الحصة دفعة واحدة.
                  </p>
                  <span className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/10 transition-colors font-sans">
                    اختيار الصور من الجهاز 💻
                  </span>
                </div>
              ) : (
                <BatchGrid
                  items={items}
                  setItems={setItems}
                  setActiveItemId={setActiveItemId}
                  setShowCropModal={setShowCropModal}
                  setClearTrigger={setClearTrigger}
                  setAppMode={setAppMode}
                  setTool={setTool}
                  setShowSidebar={setShowSidebar}
                  setLightboxItemId={setLightboxItemId}
                  onDelete={handleDeleteItem}
                  onDownload={handleDownload}
                  onStop={handleForceStop}
                  onManageApiKey={requiresUserApiKey ? () => setShowApiKeyDialog(true) : undefined}
                />
              )}

            </div>
          </div>
        )}
      </div>

      {showCropModal && activeItem && (
        <CropModal 
          imageUrl={activeItem.originalImage} 
          onComplete={handleCropComplete} 
          onCancel={() => setShowCropModal(false)} 
        />
      )}

      <ImageLightbox
        isOpen={!!lightboxItemId}
        onClose={() => setLightboxItemId(null)}
        item={lightboxItem || null}
        idx={lightboxItemIdx}
        totalItems={items.length}
        onPrevItem={() => {
          if (items.length <= 1) return;
          const currentIdx = items.findIndex(i => i.id === lightboxItemId);
          const newIdx = (currentIdx - 1 + items.length) % items.length;
          setLightboxItemId(items[newIdx].id);
        }}
        onNextItem={() => {
          if (items.length <= 1) return;
          const currentIdx = items.findIndex(i => i.id === lightboxItemId);
          const newIdx = (currentIdx + 1) % items.length;
          setLightboxItemId(items[newIdx].id);
        }}
        onSelectVariant={(variantUrl, vIdx) => {
          if (lightboxItemId) {
            setItems(prev => prev.map(i => i.id === lightboxItemId ? {
              ...i,
              resultImage: variantUrl,
              activeVariantIndex: vIdx
            } : i));
          }
        }}
        onDownload={() => {
          if (lightboxItem) {
            handleDownload(lightboxItem.resultImage || lightboxItem.originalImage, `vanishai-batch-preview-${lightboxItem.id}.jpg`);
          }
        }}
        onAccept={() => {
          if (lightboxItem) {
            setItems(prev => prev.map(i => i.id === lightboxItem.id ? acceptItemResult(i) : i));
            setClearTrigger(c => c + 1);
            setLightboxItemId(null);
          }
        }}
        onUndo={() => {
          if (lightboxItem) {
            setItems(prev => prev.map(i => i.id === lightboxItem.id ? undoItem(i) : i));
            setClearTrigger(c => c + 1);
          }
        }}
      />

      {/* Quick Preview Image Overlay (Hold to Preview) */}
      <AnimatePresence>
        {quickPreviewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-4 sm:p-8 select-none cursor-pointer"
            onPointerUp={handleItemPressEnd}
          >
            <div className="absolute top-6 right-6 flex flex-col items-end gap-1.5" dir="rtl">
              <span className="text-sm font-bold text-white bg-orange-500/90 px-3.5 py-1.5 rounded-xl border border-orange-500/30 shadow-xl font-sans">
                👀 جاري معاينة الصورة الأصلية
              </span>
              <span className="text-[10px] text-neutral-400 font-medium font-sans">
                قم بإفلات الضغط/اللمس للرجوع للتطبيق
              </span>
            </div>
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="max-w-full max-h-[80vh] flex items-center justify-center rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-neutral-950"
            >
              <img
                src={quickPreviewImage}
                alt="Quick Original Preview"
                className="max-w-full max-h-[80vh] object-contain pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ArchiveSidebar
        open={showDbSidebar}
        tab={archiveTab}
        onTabChange={setArchiveTab}
        onClose={() => setShowDbSidebar(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        activeItems={items}
        archiveItems={dbItems}
        onSaveSession={() => void handleSaveCurrentSessionNow()}
        onClearSessions={() => void handleClearAllSessions()}
        onRestoreSession={handleRestoreSession}
        onDeleteSession={(sessionId) => void handleDeleteSession(sessionId)}
        onRestoreAllImages={handleRestoreAllArchiveImages}
        onClearImages={() => void handleClearAllArchiveImages()}
        onActivateImage={handleAddFromDbToActive}
        onDeleteImage={handleDeleteFromDb}
      />

      <ApiKeyDialog
        open={requiresUserApiKey && showApiKeyDialog}
        required={requiresUserApiKey}
        hasSavedKey={hasUserApiKey}
        onClose={() => setShowApiKeyDialog(false)}
        onSave={handleSaveApiKey}
        onForget={handleForgetApiKey}
      />
    </div>
  );
}
