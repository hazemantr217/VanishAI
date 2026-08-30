import type { MouseEvent, PointerEvent } from 'react';
import {
  Crop,
  Download,
  Eraser,
  Eye,
  Move,
  Paintbrush,
  Redo,
  RotateCcw,
  RotateCw,
  Settings2,
  Square,
  Trash2,
  Undo,
  Wand2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';

export type VanishTool = 'brush' | 'eraser' | 'pan' | 'rect' | 'wand';

interface VanishToolbarProps {
  tool: VanishTool;
  onToolChange: (tool: VanishTool) => void;
  onToolOptions: (event: MouseEvent, tool: VanishTool) => void;
  hasActiveItem: boolean;
  hasMask: boolean;
  hasResult: boolean;
  hasComparison: boolean;
  canUndoImageEdit: boolean;
  canRedoImageEdit: boolean;
  isProcessing: boolean;
  onCrop: () => void;
  onClearMask: () => void;
  onDownload: () => void;
  onCompareStart: () => void;
  onCompareEnd: () => void;
  onUndoImageEdit: () => void;
  onRedoImageEdit: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

function dispatchMaskHistory(redo = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z',
    ctrlKey: true,
    shiftKey: redo,
  }));
}

export default function VanishToolbar({
  tool,
  onToolChange,
  onToolOptions,
  hasActiveItem,
  hasMask,
  hasResult,
  hasComparison,
  canUndoImageEdit,
  canRedoImageEdit,
  isProcessing,
  onCrop,
  onClearMask,
  onDownload,
  onCompareStart,
  onCompareEnd,
  onUndoImageEdit,
  onRedoImageEdit,
  settingsOpen,
  onToggleSettings,
}: VanishToolbarProps) {
  const canvasLocked = !hasActiveItem || hasResult || isProcessing;

  return (
    <motion.nav
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      aria-label="أدوات وضع الفانيش"
      className="order-last z-10 flex h-14 w-full shrink-0 items-center gap-1.5 overflow-x-auto border-t border-white/10 bg-neutral-900/75 px-3 py-2 backdrop-blur-xl lg:order-none lg:h-full lg:w-[68px] lg:flex-col lg:border-r lg:border-t-0 lg:px-2 lg:py-3"
      style={{ scrollbarWidth: 'none' }}
    >
      <ToolButton icon={Paintbrush} active={tool === 'brush'} onClick={() => onToolChange('brush')} onContextMenu={(event) => onToolOptions(event, 'brush')} tooltip="فرشاة التحديد (B)" disabled={canvasLocked} />
      <ToolButton icon={Eraser} active={tool === 'eraser'} onClick={() => onToolChange('eraser')} onContextMenu={(event) => onToolOptions(event, 'eraser')} tooltip="ممحاة التحديد (E)" disabled={canvasLocked} />
      <ToolButton icon={Square} active={tool === 'rect'} onClick={() => onToolChange('rect')} onContextMenu={(event) => onToolOptions(event, 'rect')} tooltip="تحديد مستطيل (M)" disabled={canvasLocked} />
      <ToolButton icon={Wand2} active={tool === 'wand'} onClick={() => onToolChange('wand')} onContextMenu={(event) => onToolOptions(event, 'wand')} tooltip="العصا السحرية (W)" disabled={canvasLocked} />
      <ToolButton icon={Move} active={tool === 'pan'} onClick={() => onToolChange('pan')} tooltip="تحريك وتكبير اللوحة" disabled={!hasActiveItem || isProcessing} />

      <Separator />

      <ToolButton icon={Undo} onClick={() => dispatchMaskHistory(false)} tooltip="تراجع عن آخر رسم (Ctrl+Z)" disabled={canvasLocked || !hasMask} />
      <ToolButton icon={Redo} onClick={() => dispatchMaskHistory(true)} tooltip="إعادة رسم ملغي (Ctrl+Shift+Z)" disabled={canvasLocked} />
      <ToolButton icon={Trash2} onClick={onClearMask} tooltip="مسح التحديد بالكامل" disabled={canvasLocked || !hasMask} tone="danger" />

      <Separator />

      <ToolButton icon={Crop} onClick={onCrop} tooltip="قص الصورة الأصلية" disabled={canvasLocked} />
      <ToolButton icon={RotateCcw} onClick={onUndoImageEdit} tooltip="تراجع عن قص أو نتيجة مقبولة" disabled={isProcessing || !canUndoImageEdit} />
      <ToolButton icon={RotateCw} onClick={onRedoImageEdit} tooltip="إعادة تعديل الصورة" disabled={isProcessing || !canRedoImageEdit} />
      <ToolButton
        icon={Eye}
        onPointerDown={onCompareStart}
        onPointerUp={onCompareEnd}
        onPointerLeave={onCompareEnd}
        tooltip="اضغط باستمرار لمقارنة الصورة الأصلية"
        disabled={!hasActiveItem || !hasComparison}
      />
      <ToolButton icon={Download} onClick={onDownload} tooltip="تنزيل الصورة الظاهرة" disabled={!hasActiveItem} />

      <Separator />

      <ToolButton icon={Settings2} active={settingsOpen} onClick={onToggleSettings} tooltip="إعدادات الفرشاة والفانيش" disabled={!hasActiveItem} />
    </motion.nav>
  );
}

function Separator() {
  return <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-white/10 lg:mx-0 lg:my-1 lg:h-px lg:w-8" />;
}

interface ToolButtonProps {
  icon: typeof Paintbrush;
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
  onPointerDown?: (event: PointerEvent) => void;
  onPointerUp?: (event: PointerEvent) => void;
  onPointerLeave?: (event: PointerEvent) => void;
  tooltip: string;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

function ToolButton({
  icon: Icon,
  active,
  onClick,
  onContextMenu,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  tooltip,
  disabled,
  tone = 'default',
}: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={tooltip}
      title={tooltip}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      className={cn(
        'group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-25',
        active
          ? 'border-orange-400/50 bg-orange-500 text-white shadow-md shadow-orange-500/20'
          : tone === 'danger'
            ? 'border-red-500/15 bg-red-500/[0.06] text-red-300 hover:border-red-500/35 hover:bg-red-500/15'
            : 'border-transparent bg-white/[0.035] text-neutral-400 hover:border-white/10 hover:bg-white/[0.08] hover:text-white',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
