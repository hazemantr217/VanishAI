import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Image as ImageIcon, Eraser, Move, Download, Loader2, Undo, Redo, Settings2, Crop as CropIcon, Trash2, Eye, History, Square, Wand2, Database, X, Pencil, Check, ChevronUp, ChevronDown, StopCircle, Archive, RotateCcw, FileArchive, FolderArchive, Clock, Layers, Save, CheckCircle, Sparkles, RefreshCw, CheckCircle2, AlertCircle, KeyRound, ShieldCheck } from 'lucide-react';
import CanvasWorkspace from './components/CanvasWorkspace';
import CropModal from './components/CropModal';
import BatchCard from './components/BatchCard';
import ImageLightbox from './components/ImageLightbox';
import AspectRatioSelector from './components/AspectRatioSelector';
import ApiKeyDialog from './components/ApiKeyDialog';
import { cn } from './lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { BatchItem, Preset } from './types';
import type { RuntimeConfig } from './shared/api';
import type { AspectRatio, ImageModel, ImageSize } from './shared/models';
import { GEMINI_IMAGE_MODELS, imageSizesForModel, isOpenAIModel, isSupportedAspectRatio, supportsImageSize } from './shared/models';
import { clearSessionGeminiApiKey, getRuntimeConfig, hasSessionGeminiApiKey, requestBatchMerge, requestInpaint, setSessionGeminiApiKey } from './services/api';
import { dataUrlExtension, filesToBatchItems, filenameForDataUrl, lockPixelsOutsideMask, toPngDataUrl } from './lib/images';
import { mapWithConcurrency } from './lib/concurrency';
import { acceptItemResult, redoItem, undoItem } from './lib/items';
import { DEFAULT_PRESETS } from './data/default-presets';
import { 
  initializeDatabase, 
  saveAllItems, 
  loadAllSessions, 
  saveWorkSession, 
  deleteWorkSession, 
  clearAllWorkSessions, 
  clearDatabase,
  MAX_ARCHIVE_CAPACITY,
  MAX_SESSIONS_COUNT,
  WorkSession 
} from './lib/db';

export default function App() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
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
    if (!supportsImageSize(selectedModel, imageSize)) setImageSize('1K');
  }, [selectedModel, imageSize]);
  const [enableOutpainting, setEnableOutpainting] = useState(false);
  const [outpaintPreserve2D, setOutpaintPreserve2D] = useState(true);
  const [similarityLevel, setSimilarityLevel] = useState<'high' | 'medium' | 'low'>('high');
  const [generateDiverseVariants, setGenerateDiverseVariants] = useState(false);
  const [showBrushPanel, setShowBrushPanel] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [runtimeConfigError, setRuntimeConfigError] = useState('');
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [hasUserApiKey, setHasUserApiKey] = useState(() => hasSessionGeminiApiKey());
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
  const [dbItems, setDbItems] = useState<BatchItem[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [archiveTab, setArchiveTab] = useState<'sessions' | 'images'>('sessions');
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => 'session_' + Date.now());
  const currentSessionCreatedAtRef = useRef<number>(Date.now());
  const [showDbSidebar, setShowDbSidebar] = useState(false);
  const [showReimagineSidebar, setShowReimagineSidebar] = useState(true);
  const [showVanishAdvanced, setShowVanishAdvanced] = useState(false);
  const [showVanishSystemSettings, setShowVanishSystemSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [quickPreviewImage, setQuickPreviewImage] = useState<string | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressActiveRef = useRef<boolean>(false);
  const blockClickRef = useRef<boolean>(false);

  const [isZipDownloading, setIsZipDownloading] = useState(false);
  const [zipProgress, setZipProgress] = useState<number>(0);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAbortedRef = useRef<boolean>(false);

  useEffect(() => {
    const controller = new AbortController();
    void getRuntimeConfig(controller.signal).then((config) => {
      setRuntimeConfig(config);
      setRuntimeConfigError('');
      if (config.geminiCredentialMode === 'byok' && !hasSessionGeminiApiKey()) {
        setShowApiKeyDialog(true);
      }
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setRuntimeConfig({
        geminiCredentialMode: 'byok',
        googleOnlyMode: false,
        openaiAvailable: false,
        geminiImageBillingRequired: true,
        maxBatchConcurrency: 2,
      });
      setRuntimeConfigError('تعذر قراءة إعدادات الخادم. أعد تحميل الصفحة إذا استمرت المشكلة.');
      if (!hasSessionGeminiApiKey()) setShowApiKeyDialog(true);
    });
    return () => controller.abort();
  }, []);

  const requiresUserApiKey = runtimeConfig?.geminiCredentialMode === 'byok';

  const ensureCredentials = () => {
    if (requiresUserApiKey && !hasSessionGeminiApiKey()) {
      setShowApiKeyDialog(true);
      return false;
    }
    return true;
  };

  const handleSaveApiKey = (apiKey: string) => {
    setSessionGeminiApiKey(apiKey);
    setHasUserApiKey(true);
    setShowApiKeyDialog(false);
  };

  const handleForgetApiKey = () => {
    clearSessionGeminiApiKey();
    setHasUserApiKey(false);
    if (requiresUserApiKey) setShowApiKeyDialog(true);
  };

  const handleForceStop = () => {
    isAbortedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    // Reset processing items back to pending, and remove any temporary incomplete merged item
    setItems(prev => prev
      .filter(i => !(i.id.startsWith('merged-') && i.status === 'processing'))
      .map(i => i.status === 'processing' ? { ...i, status: 'pending', errorMessage: undefined } : i)
    );
  };

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

  const [presets, setPresets] = useState<Preset[]>(() => {
    const saved = localStorage.getItem('vanishai_all_presets');
    const defaultPresets = DEFAULT_PRESETS;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge missing defaults if not present
          const existingNames = new Set(parsed.map(p => p.name));
          const missingDefaults = defaultPresets.filter(dp => !existingNames.has(dp.name));
          if (missingDefaults.length > 0) {
            const merged = [...missingDefaults, ...parsed];
            localStorage.setItem('vanishai_all_presets', JSON.stringify(merged));
            return merged;
          }
          return parsed;
        }
      } catch (e) {
        console.error("Error loading presets:", e);
      }
    }
    return defaultPresets;
  });

  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const [showAddPresetForm, setShowAddPresetForm] = useState(false);
  const [showAddPresetFormSidebar, setShowAddPresetFormSidebar] = useState(false);

  // Preset editing state
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [editingPresetPrompt, setEditingPresetPrompt] = useState('');

  // Derived active preset & prompt title
  const matchedPreset = presets.find(p => p.prompt.trim() === prompt.trim());
  const activePreset = selectedPresetName
    ? (presets.find(p => p.name === selectedPresetName && p.prompt.trim() === prompt.trim()) || matchedPreset)
    : matchedPreset;

  const activePromptTitle = activePreset
    ? activePreset.name
    : (prompt.trim() ? "✨ البرومبت المخصص" : "✍️ تخصيص البرومبت والنمط");

  const handleStartEditPreset = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetIndex(index);
    setEditingPresetName(presets[index].name);
    setEditingPresetPrompt(presets[index].prompt);
  };

  const handleSaveEditPreset = (index: number) => {
    if (!editingPresetName.trim() || !editingPresetPrompt.trim()) return;
    setPresets(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        name: editingPresetName.trim(),
        prompt: editingPresetPrompt.trim(),
      };
      localStorage.setItem('vanishai_all_presets', JSON.stringify(updated));
      return updated;
    });
    setEditingPresetIndex(null);
    setEditingPresetName('');
    setEditingPresetPrompt('');
  };

  const handleCancelEditPreset = () => {
    setEditingPresetIndex(null);
    setEditingPresetName('');
    setEditingPresetPrompt('');
  };

  const handleMovePreset = (index: number, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= presets.length) return;

    setPresets(prev => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      localStorage.setItem('vanishai_all_presets', JSON.stringify(updated));
      return updated;
    });
  };

  const handleAddPreset = (name: string, promptText: string) => {
    if (!name.trim() || !promptText.trim()) return;
    const newPreset: Preset = {
      name: name.trim(),
      prompt: promptText.trim(),
      isCustom: true
    };
    setPresets(prev => {
      const updated = [...prev, newPreset];
      localStorage.setItem('vanishai_all_presets', JSON.stringify(updated));
      return updated;
    });
    setNewPresetName('');
    setNewPresetPrompt('');
    setShowAddPresetForm(false);
    setShowAddPresetFormSidebar(false);
  };

  const handleDeletePreset = (index: number) => {
    setPresets(prev => {
      const updated = prev.filter((_, i) => i !== index);
      localStorage.setItem('vanishai_all_presets', JSON.stringify(updated));
      return updated;
    });
    if (editingPresetIndex === index) {
      handleCancelEditPreset();
    }
  };

  const handleResetPresets = () => {
    if (window.confirm("هل أنت متأكد من رغبتك في استعادة قائمة الأنماط الافتراضية وحذف الأنماط المضافة؟")) {
      localStorage.removeItem('vanishai_all_presets');
      setPresets(DEFAULT_PRESETS);
      handleCancelEditPreset();
    }
  };

  // Load saved items and work sessions from database on startup
  useEffect(() => {
    const initDatabaseState = async () => {
      try {
        const { items: loadedItems, sessions: loadedSessions } = await initializeDatabase();
        if (loadedItems && loadedItems.length > 0) {
          const baseTime = Date.now();
          const loadedWithTime = loadedItems.map((item, idx) => ({
            ...item,
            createdAt: item.createdAt ?? (baseTime - idx * 1000)
          }));
          setDbItems(loadedWithTime as any);
        }
        if (loadedSessions && loadedSessions.length > 0) {
          setSessions(loadedSessions);
        }
      } catch (err) {
        console.error("Error initializing persistent database:", err);
      } finally {
        setIsDbLoaded(true);
      }
    };
    initDatabaseState();
  }, []);

  // Debounced incremental persistence keeps large image writes off the hot render path.
  useEffect(() => {
    if (!isDbLoaded) return;

    if (dbItems.length > MAX_ARCHIVE_CAPACITY) {
      setDbItems(prev => prev.slice(0, MAX_ARCHIVE_CAPACITY));
      return;
    }

    const timer = window.setTimeout(() => {
      void saveAllItems(dbItems).catch((error) => {
        console.error('Failed to persist the image archive:', error);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dbItems, isDbLoaded]);

  // Automatically add or update active session items inside the database archive (up to 100 images)
  useEffect(() => {
    if (!isDbLoaded || items.length === 0) return;

    setDbItems((previousItems) => {
      const activeIds = new Set(items.map((item) => item.id));
      return [
        ...items,
        ...previousItems.filter((item) => !activeIds.has(item.id)),
      ].slice(0, MAX_ARCHIVE_CAPACITY);
    });
  }, [items, isDbLoaded]);

  // Auto-save the active work session snapshot (keeping up to last 5 sessions, auto-expires in 3 days)
  useEffect(() => {
    if (!isDbLoaded || items.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        const previewThumbnails = items.slice(0, 4).map(i => i.resultImage || i.originalImage);
        const sessionObj: WorkSession = {
          id: currentSessionId,
          name: `جلسة عمل (${items.length} صورة)`,
          createdAt: currentSessionCreatedAtRef.current || Date.now(),
          updatedAt: Date.now(),
          itemCount: items.length,
          completedCount: items.filter(i => i.status === 'completed').length,
          previewThumbnails,
          items: items
        };

        await saveWorkSession(sessionObj);
        const updated = await loadAllSessions();
        setSessions(updated);
      } catch (e) {
        console.error("Failed to auto-save work session:", e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [items, isDbLoaded, currentSessionId]);

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
      const newItems = [...toAdd, ...prev];
      if (!activeItemId && newItems.length > 0) {
        setActiveItemId(newItems[0].id);
      }
      return newItems;
    });
  };

  // Clear all images from the archive database
  const handleClearAllArchiveImages = async () => {
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
  };

  // Delete a specific work session manually
  const handleDeleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    await deleteWorkSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  // Clear all saved sessions manually
  const handleClearAllSessions = async () => {
    await clearAllWorkSessions();
    setSessions([]);
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

  const addImageFiles = async (files: File[]) => {
    const { items: loadedItems, failedFiles } = await filesToBatchItems(files, uuidv4);
    if (loadedItems.length > 0) {
      setItems((previousItems) => [...loadedItems, ...previousItems]);
      setActiveItemId(loadedItems[0].id);
    }
    if (failedFiles.length > 0) {
      console.error('Failed image files:', failedFiles);
      window.alert(`تعذر تحميل ${failedFiles.length} ملف صورة.`);
    }
  };

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
  }, []);

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

  const handleDeleteItem = (id: string, e?: React.MouseEvent) => {
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
  };

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

  const handleMaskChange = (dataUrl: string, dalleMaskUrl?: string, maskOverlayUrl?: string) => {
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
  };

  const handleCropComplete = (croppedImageUrl: string) => {
    if (activeItemId) {
      setItems(prev => prev.map(item => 
        item.id === activeItemId ? { 
          ...item, 
          editHistory: [...item.editHistory, item.originalImage],
          originalImage: croppedImageUrl, 
          maskedImage: null, 
          dalleMaskImage: null,
          maskOverlayImage: null,
          resultImage: null,
          redoEditHistory: [],
          status: 'pending',
        } : item
      ));
    }
    setShowCropModal(false);
  };

  const generateSingleVariant = async (item: BatchItem, index: number, signal?: AbortSignal): Promise<string> => {
    if (isAbortedRef.current || signal?.aborted) {
      throw new Error("ABORTED");
    }

    const base64ImageToSend = (appMode === 'reimagine' && !item.maskedImage) ? item.originalImage : (item.maskedImage || item.originalImage);
    const originalImageToSend = isOpenAIModel(selectedModel) && item.dalleMaskImage
      ? await toPngDataUrl(item.originalImage)
      : item.originalImage;

    if (!ensureCredentials()) throw new Error('أدخل مفتاح Gemini API للمتابعة.');
    const response = await requestInpaint({
      maskedImage: base64ImageToSend,
      originalImage: originalImageToSend,
      dalleMaskImage: item.dalleMaskImage,
      prompt: prompt.trim()
        ? (generateDiverseVariants ? `${prompt.trim()} (variation ${index + 1})` : prompt.trim())
        : '',
      maskColor: item.maskedImage ? maskColor : undefined,
      model: selectedModel,
      appMode,
      aspectRatio,
      imageSize,
      enableOutpainting,
      outpaintPreserve2D,
      similarityLevel,
    }, signal || abortControllerRef.current?.signal);

    if (
      appMode === 'vanish' &&
      !enableOutpainting &&
      item.dalleMaskImage &&
      !signal?.aborted &&
      !isAbortedRef.current
    ) {
      return lockPixelsOutsideMask(item.originalImage, response.resultImage, item.dalleMaskImage);
    }
    return response.resultImage;
  };

  const generateBatchMerge = async (images: string[], userPrompt: string, signal?: AbortSignal): Promise<string> => {
    if (isAbortedRef.current || signal?.aborted) {
      throw new Error("ABORTED");
    }

    if (images.length > 14) {
      const chunks: string[][] = [];
      for (let index = 0; index < images.length; index += 12) {
        chunks.push(images.slice(index, index + 12));
      }
      const intermediate = await mapWithConcurrency(chunks, 1, (chunk) =>
        generateBatchMerge(
          chunk,
          `${userPrompt}\nCreate a faithful intermediate group that preserves every supplied product for a later final merge.`,
          signal,
        ),
      );
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
    }, signal || abortControllerRef.current?.signal);
    return response.resultImage;
  };

  const processImage = async (item: BatchItem) => {
    if (isAbortedRef.current) return;
    if (appMode === 'vanish' && !item.maskedImage) return;
    if (appMode === 'reimagine' && !item.originalImage) return;
    
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'processing', errorMessage: undefined } : i));
    
    try {
      const isBatch = (appMode as string) === 'reimagine';
      const useMulti = isBatch ? batchEnableMultiVariant : vanishEnableMultiVariant;
      const count = useMulti ? (isBatch ? batchVariantsCount : vanishVariantsCount) : 1;
      const currentSignal = abortControllerRef.current?.signal;
      const variantIndexes = Array.from({ length: count }, (_value, index) => index);
      const results = await mapWithConcurrency(
        variantIndexes,
        isBatch ? 1 : Math.min(2, runtimeConfig?.maxBatchConcurrency || 2),
        (variantIndex) => item.inputImages && item.inputImages.length > 1
          ? generateBatchMerge(item.inputImages, prompt, currentSignal)
          : generateSingleVariant(item, variantIndex, currentSignal),
      );
      if (isAbortedRef.current || currentSignal?.aborted) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', errorMessage: undefined } : i));
        return;
      }

      const successfulVariants = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
        .map(r => r.value);
      
      if (successfulVariants.length > 0) {
        setItems(prev => prev.map(i => i.id === item.id ? { 
          ...i, 
          status: 'completed', 
          resultImage: successfulVariants[0],
          variants: successfulVariants,
          activeVariantIndex: 0
        } : i));
      } else {
        const firstErr = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        if (firstErr?.reason?.message === 'ABORTED' || isAbortedRef.current) {
          setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', errorMessage: undefined } : i));
          return;
        }
        throw firstErr?.reason || new Error("فشلت جميع محاولات توليد الصور المقترحة.");
      }
    } catch (error: any) {
      if (error?.message === 'ABORTED' || error?.name === 'AbortError' || isAbortedRef.current) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', errorMessage: undefined } : i));
        return;
      }
      if (error?.name === 'API_KEY_REQUIRED' || error?.name === 'API_KEY_INVALID') {
        handleForgetApiKey();
      }
      console.error("Inpainting error:", error);
      let errMsg = error.message || "حدث خطأ أثناء معالجة الصورة";
      const errStr = typeof error === 'object' && error !== null ? JSON.stringify(error).toLowerCase() : String(error).toLowerCase();
      
      const isQuotaError = errStr.includes("429") || errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("limit") || errStr.includes("exceeded");
      
      if (isQuotaError) {
        errMsg = "تجاوز حصة الاستخدام المجانية (Quota Exceeded): يتطلب هذا الموديل مفتاح API مدفوع ومفعل به خيار الدفع (Billing) أو مفتاح API خاص بك غير مستهلك الحصة. يرجى توفير مفتاح API مخصص أو المحاولة مجدداً لاحقاً.";
      }
      
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', errorMessage: errMsg } : i));
    }
  };

  const handleDownload = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filenameForDataUrl(filename, dataUrl);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    setIsProcessing(true);

    if (appMode === 'reimagine' && enableBatchMerge) {
      const imagesToMerge = items.map(i => i.originalImage || i.maskedImage).filter((img): img is string => !!img);
      if (imagesToMerge.length === 0) {
        setIsProcessing(false);
        return;
      }

      const mergedId = `merged-${Date.now()}`;
      const newMergedItem: BatchItem = {
        id: mergedId,
        initialImage: imagesToMerge[0],
        originalImage: imagesToMerge[0],
        inputImages: imagesToMerge,
        editHistory: [imagesToMerge[0]],
        maskedImage: null,
        resultImage: null,
        status: 'processing'
      };

      setItems(prev => [newMergedItem, ...prev]);

      try {
        const variantCount = batchEnableMultiVariant ? Math.max(1, batchVariantsCount) : 1;
        const currentSignal = abortControllerRef.current?.signal;
        const variantIndexes = Array.from({ length: variantCount }, (_value, index) => index);
        const results = await mapWithConcurrency(
          variantIndexes,
          runtimeConfig?.maxBatchConcurrency || 2,
          () => generateBatchMerge(imagesToMerge, prompt, currentSignal),
        );

        if (isAbortedRef.current || currentSignal?.aborted) {
          setItems(prev => prev.filter(item => item.id !== mergedId));
          setIsProcessing(false);
          return;
        }

        const validResults = results
          .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && !!r.value)
          .map(r => r.value);

        if (validResults.length === 0) {
          const firstErr = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
          if (firstErr?.reason?.message === 'ABORTED' || isAbortedRef.current) {
            setItems(prev => prev.filter(item => item.id !== mergedId));
            setIsProcessing(false);
            return;
          }
          throw firstErr?.reason || new Error("فشل توليد أي بديل لدمج الصور.");
        }

        setItems(prev => prev.map(item => item.id === mergedId ? {
          ...item,
          status: 'completed',
          resultImage: validResults[0],
          variants: validResults,
          activeVariantIndex: 0
        } : item));
      } catch (error: any) {
        if (error?.message === 'ABORTED' || error?.name === 'AbortError' || isAbortedRef.current) {
          setItems(prev => prev.filter(item => item.id !== mergedId));
          setIsProcessing(false);
          return;
        }
        if (error?.name === 'API_KEY_REQUIRED' || error?.name === 'API_KEY_INVALID') {
          handleForgetApiKey();
        }
        console.error("Batch Merge Error:", error);
        let errMsg = error.message || "حدث خطأ أثناء دمج الصور";
        const errStr = typeof error === 'object' && error !== null ? JSON.stringify(error).toLowerCase() : String(error).toLowerCase();
        
        const isQuotaError = errStr.includes("429") || errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("limit") || errStr.includes("exceeded");
        if (isQuotaError) {
          errMsg = "تجاوز حصة الاستخدام المجانية (Quota Exceeded): يتطلب هذا الموديل مفتاح API مدفوع أو غير مستهلك الحصة لتشغيله.";
        }
        setItems(prev => prev.map(item => item.id === mergedId ? {
          ...item,
          status: 'error',
          errorMessage: errMsg
        } : item));
      }
      setIsProcessing(false);
      return;
    }

    const pendingItems = items.filter(i => {
      const isPending = i.status === 'pending' || i.status === 'error';
      if (appMode === 'reimagine') {
        return isPending;
      } else {
        return isPending && i.maskedImage;
      }
    });

    if (appMode === 'reimagine') {
      await mapWithConcurrency(
        pendingItems,
        runtimeConfig?.maxBatchConcurrency || 2,
        (item) => processImage(item),
      );
    } else {
      // Sequential for Vanish mode (one by one)
      for (const item of pendingItems) {
        if (isAbortedRef.current) break;
        await processImage(item);
      }
    }
    setIsProcessing(false);
  };

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
        
        let base64Data = '';
        let ext: 'png' | 'jpg' | 'webp' = 'jpg';

        if (imageUrl.startsWith('data:')) {
          const commaIdx = imageUrl.indexOf(',');
          base64Data = imageUrl.substring(commaIdx + 1);
          ext = dataUrlExtension(imageUrl);
          
          const fileName = `vanishai_image_${i + 1}_${item.id.slice(0, 6)}.${ext}`;
          folder.file(fileName, base64Data, { base64: true });
        } else {
          try {
            const resp = await fetch(imageUrl);
            const blob = await resp.blob();
            const buffer = await blob.arrayBuffer();
            const extType = blob.type.includes('png') ? 'png' : 'jpg';
            const fileName = `vanishai_image_${i + 1}_${item.id.slice(0, 6)}.${extType}`;
            folder.file(fileName, buffer);
          } catch (e) {
            console.error("Error fetching image for zip:", e);
          }
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
      <ApiKeyDialog
        open={showApiKeyDialog}
        required={Boolean(requiresUserApiKey && !hasUserApiKey)}
        onClose={() => setShowApiKeyDialog(false)}
        onSave={handleSaveApiKey}
      />
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
              Drop images here
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="min-h-16 md:h-16 border-b border-white/10 bg-white/5 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between px-3 md:px-6 py-2.5 md:py-0 z-10 gap-2.5 md:gap-2">
        <div className="flex items-center justify-between md:justify-start gap-2 md:gap-3 w-full md:w-auto shrink-0">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm md:text-lg font-bold tracking-tight">VanishAI</h1>
              <p className="text-[9px] text-neutral-500 hidden sm:block font-sans">Intelligent Object Removal</p>
            </div>
          </div>

          {/* Mode Selector - Header Segmented Control */}
          <div className="flex items-center bg-black/40 border border-white/10 rounded-xl p-0.5 gap-1 shrink-0" dir="rtl">
            <button
              onClick={() => {
                setAppMode('vanish');
                setTool('brush');
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] md:text-xs font-bold transition-all cursor-pointer",
                appMode === 'vanish'
                  ? "bg-purple-600/35 text-purple-200 border border-purple-500/25 shadow-sm"
                  : "text-neutral-400 hover:text-white border border-transparent"
              )}
            >
              ✨ <span className="hidden sm:inline font-sans">وضع الفانيش</span><span className="sm:hidden font-sans">فانيش</span>
            </button>
            <button
              onClick={() => {
                setAppMode('reimagine');
              }}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] md:text-xs font-bold transition-all cursor-pointer",
                appMode === 'reimagine'
                  ? "bg-gradient-to-r from-purple-600/35 to-blue-600/35 text-blue-200 border border-purple-500/25 shadow-sm"
                  : "text-neutral-400 hover:text-white border border-transparent"
              )}
            >
              🎨 <span className="hidden sm:inline font-sans">وضع الباتش</span><span className="sm:hidden font-sans">باتش</span>
            </button>
          </div>
        </div>

        {/* Model Switcher - Center Header */}
        <div className="flex bg-neutral-900 border border-white/10 rounded-xl p-0.5 sm:p-1 gap-1 scale-90 sm:scale-100 shrink-0">
          <span className="text-neutral-400 text-[10px] md:text-xs px-1.5 md:px-2 flex items-center hidden sm:inline-block font-sans">الموديل النشط:</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value as ImageModel)}
            className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 text-white text-[10px] md:text-xs rounded-lg px-2 py-1 md:px-2.5 md:py-1.5 outline-none focus:border-purple-500 transition-all font-sans cursor-pointer min-w-[130px] sm:min-w-[170px]"
          >
            <option value="gemini-3.1-flash-lite-image">🍌 Nano Banana 2 Lite · Paid · 1K</option>
            <option value="gemini-3.1-flash-image">🍌 Nano Banana 2 · Paid</option>
            {runtimeConfig?.openaiAvailable && (
              <optgroup label="OpenAI">
                <option value="gpt-image-1.5">OpenAI GPT Image 1.5</option>
                <option value="gpt-image-2">OpenAI GPT Image 2</option>
              </optgroup>
            )}
          </select>
          <select
            value={imageSize}
            onChange={(event) => setImageSize(event.target.value as ImageSize)}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-[10px] text-white outline-none transition hover:border-neutral-700 focus:border-purple-500"
            title="دقة الصورة الناتجة"
          >
            {imageSizesForModel(selectedModel).map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto mt-1 md:mt-0">

          {/* Actions list */}
          <div className="flex items-center gap-1 md:gap-3 overflow-x-auto no-scrollbar py-0.5 max-w-full justify-end flex-1 md:flex-initial">
            {requiresUserApiKey && (
              <button
                type="button"
                onClick={() => setShowApiKeyDialog(true)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold transition',
                  hasUserApiKey
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
                )}
                title="إدارة مفتاح Gemini لهذه الجلسة"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{hasUserApiKey ? 'المفتاح متصل' : 'أضف المفتاح'}</span>
              </button>
            )}
            {activeItem && (
              <button 
                onClick={(e) => handleDeleteItem(activeItem.id, e)}
                className="p-1.5 md:px-4 md:py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium cursor-pointer"
                title="حذف الصورة الحالية"
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
                <span className="hidden md:inline">حذف الصورة</span>
              </button>
            )}
            {activeItem && (
              <button 
                onClick={() => handleDownload(activeItem.resultImage || activeItem.originalImage, `vanishai-${activeItem.id}.jpg`)}
                className="p-1.5 md:px-4 md:py-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-colors flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium"
                title="Download Current Image"
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden md:inline">Download</span>
              </button>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              multiple 
              accept="image/png,image/jpeg,image/webp"
              className="hidden" 
            />
            <button 
              onClick={processAll}
              disabled={isProcessing || items.length === 0 || !runtimeConfig}
              className="p-1.5 md:px-4 md:py-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium shadow-lg shadow-purple-500/20 cursor-pointer"
              title="Process All Masked Images"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : null}
              <span className="hidden sm:inline">{(appMode === 'reimagine' && enableBatchMerge) ? 'دمج كافة الصور 🧩' : 'Process All'}</span>
              <span className="sm:hidden">Run</span>
            </button>

            {appMode === 'reimagine' && (
              <button 
                onClick={() => setShowReimagineSidebar(p => !p)}
                className={cn(
                  "p-1.5 md:px-4 md:py-2 rounded-full transition-all border flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium cursor-pointer",
                  showReimagineSidebar 
                    ? "bg-purple-600/20 border-purple-500/40 text-purple-200" 
                    : "bg-white/10 border-transparent text-neutral-300 hover:bg-white/20"
                )}
                title="إظهار/إخفاء لوحة الخيارات"
              >
                <Settings2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
                <span>{showReimagineSidebar ? 'إخفاء الخيارات ✕' : 'إظهار الخيارات ⚙️'}</span>
              </button>
            )}

            <button 
              onClick={() => setShowSidebar(p => !p)}
              className={cn(
                "p-1.5 md:px-4 md:py-2 rounded-full transition-all border flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium cursor-pointer",
                showSidebar 
                  ? "bg-purple-600/20 border-purple-500/40 text-purple-200" 
                  : "bg-white/10 border-transparent text-neutral-300 hover:bg-white/20"
              )}
              title="Toggle Images Batch Queue"
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Queue ({items.length})</span>
              <span className="sm:hidden">({items.length})</span>
            </button>

            <button 
              onClick={() => setShowDbSidebar(p => !p)}
              className={cn(
                "p-1.5 md:px-4 md:py-2 rounded-full transition-all border flex items-center justify-center gap-1.5 text-xs md:text-sm font-medium cursor-pointer",
                showDbSidebar 
                  ? "bg-purple-600/20 border-purple-500/40 text-purple-200" 
                  : "bg-white/10 border-transparent text-neutral-300 hover:bg-white/20"
              )}
              title="الأرشيف والتحميل من قاعدة البيانات"
            >
              <Database className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span className="hidden md:inline">الأرشيف ({dbItems.length})</span>
              <span className="sm:hidden">({dbItems.length})</span>
            </button>
          </div>
        </div>
      </header>

      {runtimeConfig?.geminiCredentialMode === 'managed' && runtimeConfig.geminiImageBillingRequired && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-center text-[10px] font-bold text-amber-200" dir="rtl">
          مفتاح AI Studio متصل تلقائيًا، لكن توليد الصور يحتاج مشروع Google مدفوعًا ومفعّلًا عليه Billing؛ Lite يدعم 1K فقط وFlash يدعم 1K/2K/4K.
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Toolbar */}
        {appMode === 'vanish' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full lg:w-16 h-14 lg:h-full border-t lg:border-t-0 lg:border-r border-white/10 bg-neutral-900/50 backdrop-blur-xl flex flex-row lg:flex-col items-center justify-between lg:justify-start py-2 lg:py-4 px-4 lg:px-2 gap-2 lg:gap-3 z-10 overflow-x-auto lg:overflow-y-auto order-last lg:order-none shrink-0 no-scrollbar"
            style={{ scrollbarWidth: 'none' }}
          >
            <ToolButton 
              icon={ImageIcon} 
              active={tool === 'brush'} 
              onClick={() => handleToolClick('brush')} 
              onContextMenu={(e: any) => handleToolContextMenu(e, 'brush')}
              tooltip="فرشاة (B) - كليك يمين للخيارات" 
            />
            <ToolButton 
              icon={Eraser} 
              active={tool === 'eraser'} 
              onClick={() => handleToolClick('eraser')} 
              onContextMenu={(e: any) => handleToolContextMenu(e, 'eraser')}
              tooltip="ممحاة (E) - كليك يمين للخيارات" 
            />
            <ToolButton 
              icon={Square} 
              active={tool === 'rect'} 
              onClick={() => handleToolClick('rect')} 
              onContextMenu={(e: any) => handleToolContextMenu(e, 'rect')}
              tooltip="تحديد مستطيل (M) - كليك يمين للخيارات" 
            />
            <ToolButton 
              icon={Wand2} 
              active={tool === 'wand'} 
              onClick={() => handleToolClick('wand')} 
              onContextMenu={(e: any) => handleToolContextMenu(e, 'wand')}
              tooltip="عصا سحرية (W) - كليك يمين للخيارات" 
            />
            
            <div className="w-px h-6 lg:w-8 lg:h-px bg-white/10 shrink-0" />
            
            <ToolButton icon={CropIcon} onClick={() => activeItem && setShowCropModal(true)} tooltip="Crop Image" disabled={!activeItem} />
            <ToolButton icon={Trash2} onClick={() => setClearTrigger(c => c + 1)} tooltip="Clear Mask" disabled={!activeItem || !!activeItem.resultImage} />
            <ToolButton icon={Download} onClick={() => activeItem && handleDownload(activeItem.resultImage || activeItem.originalImage, `vanishai-${activeItem.id}.jpg`)} tooltip="Download Image" disabled={!activeItem} />
            
            <div className="w-px h-6 lg:w-8 lg:h-px bg-white/10 shrink-0" />
            
            <ToolButton 
              icon={Eye} 
              onPointerDown={() => setIsComparing(true)} 
              onPointerUp={() => setIsComparing(false)} 
              onPointerLeave={() => setIsComparing(false)} 
              tooltip="Hold to Compare (Original)" 
              disabled={!activeItem || activeItem.editHistory.length === 0} 
            />
            <ToolButton 
              icon={History} 
              onClick={handleUndoEdit} 
              tooltip="استعادة التعديل السابق (Undo Last Edit)" 
              disabled={!activeItem || activeItem.editHistory.length === 0} 
            />
            <ToolButton 
              icon={History} 
              iconClassName="-scale-x-100"
              onClick={handleRedoEdit} 
              tooltip="التراجع عن الاستعادة (Redo Last Edit)" 
              disabled={!activeItem || !activeItem.redoEditHistory || activeItem.redoEditHistory.length === 0} 
            />
 
            <div className="w-px h-6 lg:w-8 lg:h-px bg-white/10 shrink-0" />
 
            <ToolButton icon={Undo} onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
              window.dispatchEvent(event);
            }} tooltip="Undo Brush (Ctrl+Z)" />
            <ToolButton icon={Redo} onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true });
              window.dispatchEvent(event);
            }} tooltip="Redo Brush (Ctrl+Shift+Z)" />

            <div className="w-px h-6 lg:w-8 lg:h-px bg-white/10 shrink-0" />

            <ToolButton 
              icon={Settings2} 
              active={showBrushPanel} 
              onClick={() => setShowBrushPanel(!showBrushPanel)} 
              tooltip="Toggle Brush Settings" 
            />
          </motion.div>
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
                  <Settings2 className="w-4 h-4 text-purple-400" />
                  <span>لوحة الخيارات الذكية</span>
                </div>
                <span className="text-[10px] bg-purple-500/15 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/20 font-bold">VanishAI Pro</span>
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
                          <span>Size</span>
                          <span className="font-mono text-purple-400 font-semibold">{brushSize}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" 
                          max="200" 
                          value={brushSize} 
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-neutral-400">
                          <span>Hardness</span>
                          <span className="font-mono text-purple-400 font-semibold">{brushHardness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="100" 
                          value={brushHardness} 
                          onChange={(e) => setBrushHardness(Number(e.target.value))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {tool === 'wand' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-neutral-400">
                        <span className="font-sans font-medium">دقة التحديد (Tolerance)</span>
                        <span className="font-mono text-purple-400 font-bold">{wandTolerance}</span>
                      </div>
                      <input 
                        type="range" 
                        min="5" 
                        max="100" 
                        value={wandTolerance} 
                        onChange={(e) => setWandTolerance(Number(e.target.value))}
                        className="w-full accent-purple-500 cursor-pointer"
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
                            maskColor === color ? "border-white scale-110 ring-2 ring-purple-500/30" : "border-transparent hover:scale-110"
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
                      <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 relative"></div>
                    </label>
                  </div>
                  {enableOutpainting && (
                    <div className="mt-2 p-2.5 bg-neutral-900/60 border border-purple-500/20 rounded-lg space-y-3">
                      <p className="text-[9px] text-purple-400 leading-normal text-right font-sans">
                        💡 ممتاز! قم بتحديد/تلوين المناطق الفارغة أو الهوامش المراد تكميلها (مثال: باللون الأحمر أو الأخضر) وسيقوم الموديل بتوسيع الصورة بذكاء لملئها seamlessly.
                      </p>

                      {/* 2D Design Mode Toggle */}
                      <div className="flex justify-between items-center text-xs text-neutral-300 pt-1.5 border-t border-white/5">
                        <div className="flex flex-col pr-1 text-right">
                          <span className="font-semibold font-sans text-[11px] text-purple-200">📐 الحفاظ على التصميم ثنائي الأبعاد (2D)</span>
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
                          <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 relative"></div>
                        </label>
                      </div>

                      {/* Similarity & Variation Selector */}
                      <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                        <div className="flex justify-between text-[11px] text-neutral-300 font-sans">
                          <span className="text-[9px] text-neutral-500">معدل الاختلاف بين الخيارات الأربعة</span>
                          <span className="font-semibold text-purple-200">🎯 مستوى التشابه بين النتائج</span>
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
                                  ? 'bg-purple-600/30 border-purple-500 text-white font-semibold'
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
                          <span className="font-semibold font-sans text-[11px] text-purple-200">🔀 توليد أفكار مختلفة كلياً لكل بديل</span>
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
                          <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600 relative"></div>
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
                    <span className="text-purple-400 font-mono text-[10px]">{showVanishAdvanced ? 'إخفاء ▴' : 'توسيع البرومبت ▾'}</span>
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
                          className="w-full bg-black/50 border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder:text-neutral-500 resize-none h-20 focus:outline-none focus:border-purple-500 transition-colors leading-relaxed font-sans"
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
                    <span className="text-purple-400 font-mono text-[10px]">{showVanishSystemSettings ? 'إخفاء ▴' : 'توسيع ▾'}</span>
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
                              <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
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
                                        ? "bg-purple-600 text-white shadow-md shadow-purple-500/15" 
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

                        {/* Credential mode is detected by the server; secrets never enter the bundle. */}
                        <div className="space-y-2 pt-2 border-t border-white/5">
                          <div className="text-xs text-neutral-400 font-medium font-sans">اتصال آمن بالخادم</div>
                          <div className="rounded-xl border border-white/5 bg-black/40 p-2.5 text-[10px] leading-relaxed text-neutral-400">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 font-bold text-neutral-200">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                                {requiresUserApiKey ? 'مفتاح حسابك' : 'مفتاح AI Studio الافتراضي'}
                              </span>
                              {requiresUserApiKey && (
                                <button type="button" onClick={() => setShowApiKeyDialog(true)} className="text-purple-300 hover:text-purple-200">
                                  {hasUserApiKey ? 'تغيير المفتاح' : 'إضافة المفتاح'}
                                </button>
                              )}
                            </div>
                            <p className="mt-1">كل عمليات Gemini تمر عبر الخادم ولا يتم تضمين أي مفتاح في كود المتصفح.</p>
                          </div>
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
                className="max-w-md w-full border-2 border-dashed border-neutral-800 hover:border-purple-500/40 bg-neutral-900/10 hover:bg-purple-950/5 rounded-3xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer select-none group"
              >
                <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 group-hover:text-purple-400 group-hover:border-purple-500/20 transition-all mb-4 shadow-xl">
                  <Upload className="w-8 h-8 group-hover:scale-110 transition-transform animate-bounce" />
                </div>
                <h4 className="text-base font-bold text-neutral-200 group-hover:text-white transition-colors mb-2 font-sans">قم برفع صورة للبدء في مسح العناصر</h4>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed mb-6 font-sans">
                  قم بسحب وإفلات صورتك هنا أو انقر لاختيارها من جهازك، أو يمكنك إضافة صورة سابقة من معرض الأرشيف في قاعدة البيانات!
                </p>
                <div className="flex flex-col sm:flex-row gap-2 w-full justify-center">
                  <span className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-500/10 transition-colors font-sans">
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
                    <div className="absolute -inset-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full blur-xl opacity-35 animate-pulse"></div>
                    
                    {/* Rotating modern circular progress */}
                    <div className="w-20 h-20 rounded-full border-4 border-neutral-800 border-t-purple-500 border-r-blue-500 animate-spin flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  
                  <h3 className="text-base font-bold text-white mb-2 flex items-center gap-1.5 shrink-0 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
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
                      <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping"></div>
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
                          {requiresUserApiKey
                            ? 'استخدم مفتاحًا آخر له حصة متاحة أو فعّل Billing على مشروع المفتاح الحالي.'
                            : 'انتظر تجدد الحصة أو اضبط مفتاح AI Studio الافتراضي على مشروع به Billing وحصة متاحة.'}
                        </p>
                        {requiresUserApiKey && (
                          <div className="mt-2.5 flex justify-start">
                            <button
                              type="button"
                              onClick={() => setShowApiKeyDialog(true)}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[10px] font-bold transition-all cursor-pointer shadow-md shadow-amber-500/10 flex items-center gap-1"
                            >
                              <span>تغيير مفتاح Gemini 🔑</span>
                            </button>
                          </div>
                        )}
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
                    Original Image
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
                         setItems(prev => prev.map(i => i.id === activeItem.id ? {
                           ...i,
                           editHistory: [...i.editHistory, i.originalImage],
                           redoEditHistory: [],
                           originalImage: i.resultImage!,
                           resultImage: null,
                           maskedImage: null,
                           dalleMaskImage: null,
                           maskOverlayImage: null,
                           variants: undefined,
                           activeVariantIndex: undefined,
                           status: 'pending'
                         } : i));
                         setClearTrigger(c => c + 1);
                       }} 
                       className="px-4 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-green-500/20 text-center w-full sm:w-auto"
                     >
                       Accept & Edit Further
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
                       Discard
                     </button>
                     <button 
                       onClick={() => handleDownload(activeItem.resultImage!, `vanishai-${activeItem.id}.jpg`)} 
                       className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 w-full sm:w-auto"
                     >
                       <Download size={16} />
                       Download
                     </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Variants Switcher Panel */}
            {activeItem && activeItem.variants && activeItem.variants.length > 1 && !isComparing && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-35 bg-neutral-900/95 border border-purple-500/30 backdrop-blur-2xl px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3">
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
                          isActive ? "border-purple-500 scale-110 ring-2 ring-purple-500/20 shadow-md" : "border-white/10 hover:border-white/30"
                        )}
                      >
                        <img src={variantUrl} alt={`Variant ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute bottom-0 right-0 left-0 bg-purple-900/80 text-[8px] text-white text-center py-0.5 font-bold font-mono">
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
                            ? "border-purple-500/50 bg-purple-500/10" 
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
                            <span className="text-xs text-neutral-400 capitalize">{item.status}</span>
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
                      <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center text-purple-400">
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
                  className="w-full py-2.5 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 hover:border-purple-500/40 transition-all font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer font-sans"
                >
                  <span>✨ الانتقال لوضع مسح العناصر (الفرشاة)</span>
                </button>
              </div>

              {/* Prompt Input Textarea */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-200 flex items-start justify-between gap-2 font-sans leading-tight">
                  <span className="text-purple-300 leading-snug break-words flex-1">
                    {activePromptTitle}
                  </span>
                  <span className="text-[9px] text-purple-400/80 font-normal shrink-0 pt-0.5">(يُطبق على كافة الصور)</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setSelectedPresetName(null);
                  }}
                  placeholder="مثال: أعد إنشاء هذه الصورة بجودة فائقة (Super Resolution) مع تحسين تفاصيل الإضاءة والظلال ورفع حدة الألوان مع إضافة تفاصيل كلين ديجيتال..."
                  disabled={isProcessing}
                  className="w-full h-28 bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-purple-500 transition-colors leading-relaxed font-sans"
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
                      className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors font-bold flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
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
                      className="overflow-hidden bg-black/40 border border-purple-500/20 rounded-xl p-2.5 space-y-2 mb-2"
                    >
                      <input
                        type="text"
                        placeholder="اسم النمط (مثال: ✨ دمج الإضاءة)"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                      <textarea
                        placeholder="وصف البرومبت التفصيلي للنمط..."
                        value={newPresetPrompt}
                        onChange={(e) => setNewPresetPrompt(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg p-2 text-xs text-white placeholder:text-neutral-500 resize-none h-16 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPreset(newPresetName, newPresetPrompt)}
                        className="w-full py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-colors cursor-pointer"
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
                      <div key={i} className="flex flex-col gap-1.5 p-2 rounded-xl bg-purple-950/50 border border-purple-500/40 w-full font-sans my-1">
                        <input
                          type="text"
                          value={editingPresetName}
                          onChange={(e) => setEditingPresetName(e.target.value)}
                          className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500 font-bold"
                          placeholder="اسم النمط..."
                        />
                        <textarea
                          value={editingPresetPrompt}
                          onChange={(e) => setEditingPresetPrompt(e.target.value)}
                          className="w-full h-16 bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-white placeholder:text-neutral-500 resize-none focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
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
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1"
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
                            ? "bg-purple-600/20 border-purple-500/60 shadow-sm shadow-purple-500/10"
                            : "bg-neutral-800/40 hover:bg-purple-600/10 border-white/5 hover:border-purple-500/20"
                        )}
                      >
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => {
                            setPrompt(p.prompt);
                            setSelectedPresetName(p.name);
                          }}
                          className="flex-1 text-right text-xs text-neutral-200 hover:text-purple-200 font-bold cursor-pointer min-w-0 disabled:opacity-50 flex items-center gap-1.5 justify-start"
                          title="تطبيق نص البرومبت مع الاحتفاظ بالأبعاد المحددة"
                        >
                          {isSelected && <span className="text-purple-400 font-black text-xs shrink-0">✓</span>}
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
                            className="opacity-50 hover:opacity-100 p-1 rounded-lg hover:bg-purple-500/20 text-neutral-400 hover:text-purple-300 transition-all cursor-pointer flex shrink-0 disabled:opacity-30"
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

              {/* Server-selected credential mode */}
              <div className="space-y-2 bg-black/20 p-3 rounded-xl border border-white/5">
                <div className="text-[11px] text-neutral-400 font-bold font-sans">🔐 اتصال Gemini الآمن:</div>
                <div className="rounded-xl border border-white/5 bg-black/40 p-2.5">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {requiresUserApiKey ? 'BYOK — مفتاح المستخدم' : 'Google AI Studio — تلقائي'}
                    </span>
                    {requiresUserApiKey && (
                      <button type="button" disabled={isProcessing} onClick={() => setShowApiKeyDialog(true)} className="font-bold text-purple-300 hover:text-purple-200 disabled:opacity-50">
                        {hasUserApiKey ? 'تغيير' : 'إضافة'}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] leading-relaxed text-neutral-500">المفتاح لا يُضمّن داخل ملفات الواجهة ولا يُحفظ على الخادم.</p>
                </div>
              </div>

              {/* Batch Merge Option Card */}
              <div className="space-y-3 bg-purple-950/20 p-3 rounded-xl border border-purple-500/25">
                <div className="flex justify-between items-center text-xs text-neutral-300">
                  <div className="flex flex-col">
                    <span className="font-bold font-sans text-purple-200">🧩 دمج كافة صور الباتش في صورة واحدة</span>
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
                    <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                {enableBatchMerge && (
                  <div className="space-y-1.5 pt-1.5 border-t border-purple-500/15">
                    <p className="text-[10px] text-purple-300/90 leading-relaxed font-sans">
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
                    <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
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
                                ? "bg-purple-600 text-white shadow-md shadow-purple-500/15" 
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
                      className="w-full py-3 px-4 rounded-xl bg-purple-600/30 text-purple-300 font-bold text-xs flex items-center justify-center gap-2 animate-pulse font-sans"
                    >
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
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
                      <div className="bg-purple-500 h-full animate-pulse" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={processAll}
                    disabled={enableBatchMerge ? items.length === 0 : items.filter(i => i.status === 'pending' || i.status === 'error').length === 0}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 disabled:from-neutral-800 disabled:to-neutral-800 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-purple-500/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer transform hover:scale-[1.01] font-sans"
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
                    <div className="flex items-center gap-1 text-[11px] bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/20 font-semibold text-purple-300 font-mono">
                      <span className="font-sans text-[9px] text-purple-400">قيد المعالجة:</span>
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
                  className="flex-1 min-h-[350px] border-2 border-dashed border-neutral-800 hover:border-purple-500/40 bg-neutral-900/10 hover:bg-purple-950/5 rounded-3xl flex flex-col items-center justify-center p-8 text-center transition-all cursor-pointer select-none group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-white/5 flex items-center justify-center text-neutral-400 group-hover:text-purple-400 group-hover:border-purple-500/20 transition-all mb-4 shadow-xl">
                    <Upload className="w-8 h-8 group-hover:scale-110 transition-transform animate-bounce" />
                  </div>
                  <h4 className="text-base font-bold text-neutral-200 group-hover:text-white transition-colors mb-2 font-sans">قم برفع صور المعالجة الجماعية (Batch)</h4>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed mb-6 font-sans">
                    قم بسحب وإفلات صورك هنا أو انقر لاختيارها من جهازك مباشرة. يمكنك رفع لغاية 5 صور أو أكثر ومعالجتهم دفعة واحدة بالتوازي لتوفير الوقت!
                  </p>
                  <span className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-500/10 transition-colors font-sans">
                    اختيار الصور من الجهاز 💻
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 pb-12">
                  {items.map((item, idx) => (
                    <BatchCard
                      key={item.id}
                      item={item}
                      idx={idx}
                      onDelete={() => handleDeleteItem(item.id)}
                      onCrop={() => {
                        setActiveItemId(item.id);
                        setShowCropModal(true);
                      }}
                      onReset={() => {
                        setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'pending', errorMessage: undefined, resultImage: null, variants: undefined } : i));
                      }}
                      onEditInVanish={() => {
                        setItems(prev => prev.map(i => i.id === item.id ? acceptItemResult(i) : i));
                        setClearTrigger(c => c + 1);
                        setActiveItemId(item.id);
                        setAppMode('vanish');
                        setTool('brush');
                        setShowSidebar(true);
                      }}
                      onAccept={() => {
                        setItems(prev => prev.map(i => i.id === item.id ? acceptItemResult(i) : i));
                        setClearTrigger(c => c + 1);
                      }}
                      onUndo={() => {
                        setItems(prev => prev.map(i => i.id === item.id ? undoItem(i) : i));
                        setClearTrigger(c => c + 1);
                      }}
                      onDownload={() => handleDownload(item.resultImage || item.originalImage, `vanishai-batch-${item.id}.jpg`)}
                      onStop={handleForceStop}
                      onSelectVariant={(variantUrl, vIdx) => {
                        setItems(prev => prev.map(i => i.id === item.id ? {
                          ...i,
                          resultImage: variantUrl,
                          activeVariantIndex: vIdx
                        } : i));
                      }}
                      onImageDoubleClick={() => setLightboxItemId(item.id)}
                    />
                  ))}
                </div>
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
              <span className="text-sm font-bold text-white bg-purple-600/90 px-3.5 py-1.5 rounded-xl border border-purple-500/30 shadow-xl font-sans">
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

      {/* Database History & Sessions Sidebar */}
      <AnimatePresence>
        {showDbSidebar && (
          <>
            {/* Backdrop Overlay for mobile screens */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDbSidebar(false)}
              className="fixed inset-0 bg-black/60 z-[49] lg:hidden"
            />

            {/* Sidebar Panel */}
            <motion.div 
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full sm:w-96 border-l border-white/10 bg-neutral-900/95 backdrop-blur-xl flex flex-col z-50 shrink-0 fixed right-0 top-16 bottom-0 shadow-2xl h-[calc(100vh-4rem)]"
              dir="rtl"
            >
              {/* Drawer Top Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-bold font-sans">معرض الأرشيف وجلسات العمل</h2>
                </div>
                <button 
                  onClick={() => setShowDbSidebar(false)}
                  className="p-1 px-2.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors text-xs font-sans"
                >
                  إغلاق ✕
                </button>
              </div>

              {/* Navigation Tabs (Sessions vs Individual Images Archive) */}
              <div className="p-2 border-b border-white/5 bg-black/20 flex gap-1.5">
                <button
                  onClick={() => setArchiveTab('sessions')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans",
                    archiveTab === 'sessions'
                      ? "bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <FolderArchive className="w-3.5 h-3.5 text-purple-400" />
                  <span>آخر 5 جلسات</span>
                  <span className="text-[10px] bg-purple-500/20 px-1.5 py-0.2 rounded-full font-mono">
                    {sessions.length}/5
                  </span>
                </button>

                <button
                  onClick={() => setArchiveTab('images')}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans",
                    archiveTab === 'images'
                      ? "bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm"
                      : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
                  )}
                >
                  <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                  <span>صور الأرشيف</span>
                  <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.2 rounded-full font-mono">
                    {dbItems.length}/100
                  </span>
                </button>
              </div>

              {/* TAB 1: WORK SESSIONS */}
              {archiveTab === 'sessions' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Sessions Action Bar & Expiry Notice */}
                  <div className="p-3 bg-neutral-950/40 border-b border-white/5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={handleSaveCurrentSessionNow}
                        disabled={items.length === 0}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 disabled:opacity-40 text-purple-200 border border-purple-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer font-sans"
                        title="حفظ جلسة العمل الحالية كنسخة مستقلة في الأرشيف"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ الجلسة الحالية ({items.length})</span>
                      </button>

                      {sessions.length > 0 && (
                        <button
                          onClick={handleClearAllSessions}
                          className="py-1.5 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium flex items-center justify-center gap-1 transition-all cursor-pointer font-sans"
                          title="مسح كافة الجلسات المحفوظة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>مسح الكل</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-purple-950/20 border border-purple-500/15 text-[10px] text-purple-300/80 font-sans leading-relaxed">
                      <Clock className="w-3.5 h-3.5 shrink-0 text-purple-400 mt-0.5" />
                      <div>
                        <strong>حفظ تلقائي لآخر 5 جلسات:</strong> تُحفظ جلسات العمل بكامل تفاصيلها وتُحذف تلقائياً بعد مرور 3 أيام في حال عدم استخدامها.
                      </div>
                    </div>
                  </div>

                  {/* Sessions List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                    {sessions.map((session, sIdx) => {
                      const isCurrentSession = session.id === currentSessionId;
                      const sessionDate = new Date(session.updatedAt || session.createdAt);
                      
                      return (
                        <div
                          key={session.id}
                          className={cn(
                            "p-3 rounded-xl border transition-all flex flex-col gap-3 bg-white/5",
                            isCurrentSession ? "border-purple-500/30 bg-purple-500/10" : "border-white/5 hover:bg-white/10"
                          )}
                        >
                          {/* Session Header Info */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold font-mono">
                                #{sIdx + 1}
                              </span>
                              <div>
                                <h3 className="text-xs font-bold text-neutral-200 font-sans">
                                  جلسة عمل ({session.itemCount} صورة)
                                </h3>
                                <p className="text-[10px] text-neutral-400 font-mono mt-0.5">
                                  {sessionDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })} - {sessionDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                              {isCurrentSession && (
                                <span className="text-[9px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full border border-green-500/30 font-bold font-sans">
                                  الجلسة الحالية ●
                                </span>
                              )}
                              <span className="text-[9px] text-neutral-400 font-sans">
                                مكتمل: {session.completedCount}/{session.itemCount}
                              </span>
                            </div>
                          </div>

                          {/* Session Thumbnail Grid Preview */}
                          {session.previewThumbnails && session.previewThumbnails.length > 0 && (
                            <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-1.5 rounded-lg border border-white/5">
                              {session.previewThumbnails.map((thumbUrl, tIdx) => (
                                <div key={tIdx} className="aspect-square rounded-md overflow-hidden bg-black/60 border border-white/10">
                                  <img 
                                    src={thumbUrl} 
                                    alt={`Session item ${tIdx + 1}`} 
                                    className="w-full h-full object-cover pointer-events-none" 
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Session Actions */}
                          <div className="flex items-center gap-2 border-t border-white/5 pt-2.5">
                            <button
                              onClick={() => handleRestoreSession(session)}
                              className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer font-sans shadow-md"
                              title="استعادة كافة الصور والتعديلات من هذه الجلسة إلى العمل النشط"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>استعادة هذه الجلسة ↺</span>
                            </button>

                            <button
                              onClick={(e) => handleDeleteSession(session.id, e)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-500/20 cursor-pointer"
                              title="حذف هذه الجلسة نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {sessions.length === 0 && (
                      <div className="text-center py-12 px-2 text-sm text-neutral-400 font-sans leading-relaxed">
                        <FolderArchive className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                        <p className="font-bold text-neutral-300">لا توجد جلسات عمل محفوظة حالياً</p>
                        <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed">
                          عند رفع وتعديل الصور، يتم حفظ آخر 5 جلسات عمل تلقائياً في قاعدة البيانات لاستعادتها في أي وقت حتى بعد إغلاق المتصفح أو عمل ريفرش!
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: INDIVIDUAL IMAGES ARCHIVE (100 Capacity) */}
              {archiveTab === 'images' && (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* Images Action Bar */}
                  <div className="p-3 bg-neutral-950/40 border-b border-white/5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={handleRestoreAllArchiveImages}
                        disabled={dbItems.length === 0}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer font-sans shadow-md"
                        title="استعادة كل الصور المحفوظة في الأرشيف إلى العمل النشط"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>استعادة الكل للعمل النشط 📥 ({dbItems.length})</span>
                      </button>

                      {dbItems.length > 0 && (
                        <button
                          onClick={handleClearAllArchiveImages}
                          className="py-1.5 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium flex items-center justify-center gap-1 transition-all cursor-pointer font-sans"
                          title="تفريغ كل الصور من الأرشيف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>تفريغ</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-sans bg-black/30 p-1.5 rounded-lg border border-white/5">
                      <span>سعة الأرشيف: <strong>100 صورة</strong></span>
                      <span className="font-mono text-purple-300 font-bold">{dbItems.length} / 100</span>
                    </div>
                  </div>

                  {/* Images List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin' }}>
                    {dbItems.map((item, idx) => {
                      const isAlreadyInActive = items.some(i => i.id === item.id);
                      return (
                        <div 
                          key={item.id}
                          className={cn(
                            "p-3 rounded-xl border transition-all flex flex-col gap-3 bg-white/5",
                            isAlreadyInActive ? "border-purple-500/25 bg-purple-500/5" : "border-white/5 hover:bg-white/10"
                          )}
                        >
                          <div className="flex gap-3">
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-black/50 shrink-0 relative border border-white/10">
                              <img src={item.resultImage || item.originalImage} alt="thumbnail" className="w-full h-full object-cover pointer-events-none" />
                            </div>
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <p className="text-xs font-semibold text-neutral-300 truncate font-sans">صورة محفوظة #{dbItems.length - idx}</p>
                              <p className="text-[10px] text-neutral-500 mt-1 font-mono">{new Date(item.createdAt || Date.now()).toLocaleDateString('ar-EG')}</p>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <div className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  item.status === 'completed' ? "bg-green-500" :
                                  item.status === 'processing' ? "bg-blue-500" :
                                  item.status === 'error' ? "bg-red-500" : "bg-neutral-500"
                                )} />
                                <span className="text-[10px] text-neutral-400 capitalize font-sans">{item.status === 'completed' ? 'جاهزة' : item.status}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 border-t border-white/5 pt-2.5 mt-1">
                            <button
                              onClick={() => handleAddFromDbToActive(item)}
                              className={cn(
                                "flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer text-center font-sans",
                                isAlreadyInActive 
                                  ? "bg-purple-600/15 text-purple-300 border border-purple-500/30 font-semibold" 
                                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold"
                              )}
                            >
                              {isAlreadyInActive ? "نشطة حالياً ✓" : "إضافة للعمل النشط ➕"}
                            </button>
                            
                            <button
                              onClick={(e) => handleDeleteFromDb(item.id, e)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors border border-red-500/20 cursor-pointer"
                              title="حذف نهائي من الأرشيف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {dbItems.length === 0 && (
                      <div className="text-center py-12 px-2 text-sm text-neutral-400 font-sans leading-relaxed">
                        <ImageIcon className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                        <p className="font-bold text-neutral-300">لا توجد صور محفوظة في الأرشيف حالياً</p>
                        <p className="text-xs text-neutral-500 mt-1.5">
                          تتسع قاعدة البيانات حتى 100 صورة ويتم حفظ أي صورة ترفعها وتعدلها تلقائياً!
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ icon: Icon, active, onClick, onContextMenu, onPointerDown, onPointerUp, onPointerLeave, tooltip, disabled, iconClassName }: any) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      title={tooltip}
      disabled={disabled}
      className={cn(
        "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all relative group",
        active ? "bg-purple-500 text-white shadow-lg shadow-purple-500/20" : "text-neutral-400 hover:text-white hover:bg-white/10",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <Icon className={cn("w-5 h-5", iconClassName)} />
    </button>
  );
}
