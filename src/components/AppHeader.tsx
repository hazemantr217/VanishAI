import type { ChangeEvent, RefObject } from 'react';
import {
  Archive,
  Download,
  Images,
  KeyRound,
  Loader2,
  PanelRight,
  Settings2,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import type { ImageModel, ImageSize } from '../shared/models';
import { imageSizesForModel, isOpenAIModel } from '../shared/models';
import { cn } from '../lib/utils';

interface AppHeaderProps {
  appMode: 'vanish' | 'reimagine';
  onModeChange: (mode: 'vanish' | 'reimagine') => void;
  selectedModel: ImageModel;
  onModelChange: (model: ImageModel) => void;
  imageSize: ImageSize;
  onImageSizeChange: (size: ImageSize) => void;
  openaiAvailable: boolean;
  requiresUserApiKey: boolean;
  hasUserApiKey: boolean;
  onManageApiKey: () => void;
  hasActiveItem: boolean;
  onDeleteActive: () => void;
  onDownloadActive: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  isProcessing: boolean;
  primaryDisabled: boolean;
  isMergeMode: boolean;
  onProcess: () => void;
  onStop: () => void;
  optionsOpen: boolean;
  onToggleOptions: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  itemCount: number;
  archiveOpen: boolean;
  onToggleArchive: () => void;
  archiveCount: number;
}

const secondaryButton = 'flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-bold text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-35';

export default function AppHeader({
  appMode,
  onModeChange,
  selectedModel,
  onModelChange,
  imageSize,
  onImageSizeChange,
  openaiAvailable,
  requiresUserApiKey,
  hasUserApiKey,
  onManageApiKey,
  hasActiveItem,
  onDeleteActive,
  onDownloadActive,
  fileInputRef,
  onFileUpload,
  isProcessing,
  primaryDisabled,
  isMergeMode,
  onProcess,
  onStop,
  optionsOpen,
  onToggleOptions,
  queueOpen,
  onToggleQueue,
  itemCount,
  archiveOpen,
  onToggleArchive,
  archiveCount,
}: AppHeaderProps) {
  return (
    <header className="relative z-20 border-b border-white/10 bg-neutral-950/90 px-3 py-2.5 shadow-xl shadow-black/10 backdrop-blur-2xl md:px-5" dir="rtl">
      <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
        {/* 1. Logo & Branding (Right side in RTL) */}
        <div className="flex min-w-fit items-center gap-2" dir="ltr">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 shadow-lg shadow-orange-500/20">
            <Sparkles className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="leading-none">
            <h1 className="text-sm font-black tracking-tight text-white md:text-base">VanishAI</h1>
            <p className="mt-1 hidden text-[8px] font-medium uppercase tracking-[0.15em] text-neutral-500 sm:block">precision image studio</p>
          </div>
        </div>

        {/* 2. Run / Stop Execution Button (Right side next to Logo) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={isProcessing ? onStop : onProcess}
            disabled={!isProcessing && primaryDisabled}
            className={cn(
              'flex h-9 min-w-[110px] items-center justify-center gap-1.5 rounded-xl px-4 text-[11px] font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35',
              isProcessing
                ? 'bg-red-600 shadow-red-500/15'
                : 'bg-gradient-to-r from-orange-500 to-amber-500 shadow-orange-500/20 ring-1 ring-white/20',
            )}
            title={isProcessing ? 'إيقاف الطلبات الحالية' : appMode === 'vanish' ? 'تشغيل الصور التي تحتوي على تحديد' : 'تشغيل الدفعة'}
          >
            {isProcessing ? <Square className="h-3.5 w-3.5 fill-current" /> : <Sparkles className="h-3.5 w-3.5" />}
            {isProcessing ? 'إيقاف' : isMergeMode ? 'دمج الصور' : 'تشغيل الكل'}
          </button>
        </div>

        {/* 3. Model Selector */}
        <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.035] p-1 sm:min-w-[180px] lg:max-w-[260px]">
          <span className="hidden pr-2 text-[9px] font-bold text-neutral-500 md:block">الموديل</span>
          <select
            value={selectedModel}
            onChange={(event) => onModelChange(event.target.value as ImageModel)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-neutral-900 px-2 text-[11px] font-bold text-white outline-none transition hover:border-white/10 focus:border-orange-500"
            dir="ltr"
          >
            <option value="gemini-3.1-flash-lite-image">🍌 Nano Banana 2 Lite</option>
            <option value="gemini-3.1-flash-image">🍌 Nano Banana 2</option>
            {openaiAvailable && (
              <optgroup label="OpenAI — خارج AI Studio">
                <option value="gpt-image-1.5">GPT Image 1.5</option>
                <option value="gpt-image-2">GPT Image 2</option>
              </optgroup>
            )}
          </select>
          {openaiAvailable && isOpenAIModel(selectedModel) && (
            <select
              value={imageSize}
              onChange={(event) => onImageSizeChange(event.target.value as ImageSize)}
              className="h-8 rounded-lg border border-white/10 bg-neutral-900 px-2 text-[10px] font-bold text-white outline-none focus:border-orange-500"
              title="جودة OpenAI فقط"
            >
              {imageSizesForModel(selectedModel).map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          )}
        </div>

        {/* Spacer to push Vanish/Batch toggle and tools to the Left in RTL */}
        <div className="hidden flex-1 lg:block" />

        <button
          type="button"
          onClick={onManageApiKey}
          className={cn(
            secondaryButton,
            hasUserApiKey
              ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
              : 'border-orange-500/30 text-orange-300 hover:bg-orange-500/10',
          )}
          title="إعداد أو تحديث مفتاح Gemini API"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">{hasUserApiKey ? 'مفتاح مخصص متصل' : 'مفتاح API'}</span>
        </button>

        {/* 4. Vanish / Batch Mode Toggle (Shifted to Left) */}
        <div className="flex rounded-xl border border-white/10 bg-black/40 p-1">
          <button
            type="button"
            onClick={() => onModeChange('vanish')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition',
              appMode === 'vanish' ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-neutral-400 hover:text-white',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> فانيش
          </button>
          <button
            type="button"
            onClick={() => onModeChange('reimagine')}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition',
              appMode === 'reimagine' ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20' : 'text-neutral-400 hover:text-white',
            )}
          >
            <Images className="h-3.5 w-3.5" /> الباتش
          </button>
        </div>

        {/* 5. Tool Actions (Far Left in RTL) */}
        <div className="flex w-full items-center gap-1.5 overflow-x-auto border-t border-white/5 pt-2 lg:w-auto lg:border-0 lg:pt-0">
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFileUpload} />
          <button type="button" onClick={onDownloadActive} disabled={!hasActiveItem} className={secondaryButton} title="تنزيل الصورة الحالية">
            <Download className="h-3.5 w-3.5 text-orange-300" /><span className="hidden 2xl:inline">تنزيل</span>
          </button>
          <button type="button" onClick={onDeleteActive} disabled={!hasActiveItem || isProcessing} className={cn(secondaryButton, 'hover:border-red-500/30 hover:text-red-300')} title="حذف الصورة الحالية">
            <Trash2 className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">حذف</span>
          </button>
          {appMode === 'reimagine' && (
            <button type="button" onClick={onToggleOptions} className={cn(secondaryButton, optionsOpen && 'border-orange-500/30 bg-orange-500/10 text-orange-200')} title="خيارات الباتش">
              <Settings2 className="h-3.5 w-3.5" /><span className="hidden xl:inline">الخيارات</span>
            </button>
          )}
          <button type="button" onClick={onToggleQueue} className={cn(secondaryButton, queueOpen && 'border-orange-500/30 bg-orange-500/10 text-orange-200')} title="قائمة الصور">
            <PanelRight className="h-3.5 w-3.5" /><span>الصور</span><span className="rounded-md bg-black/40 px-1.5 py-0.5 text-[9px]">{itemCount}</span>
          </button>
          <button type="button" onClick={onToggleArchive} className={cn(secondaryButton, archiveOpen && 'border-orange-500/30 bg-orange-500/10 text-orange-200')} title="الأرشيف والجلسات">
            <Archive className="h-3.5 w-3.5" /><span>الأرشيف</span><span className="rounded-md bg-black/40 px-1.5 py-0.5 text-[9px]">{archiveCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
