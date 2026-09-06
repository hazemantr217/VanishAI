import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, RotateCcw, Trash2, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isAlert?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'danger',
  isAlert = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          dir="rtl"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-5 sm:p-6 shadow-2xl flex flex-col gap-4 font-sans select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  variant === 'danger'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                    : variant === 'warning'
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                    : 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                }`}>
                  {variant === 'danger' && <Trash2 className="h-5 w-5" />}
                  {variant === 'warning' && <RotateCcw className="h-5 w-5" />}
                  {variant === 'info' && <Info className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{title}</h3>
                </div>
              </div>

              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/5 hover:text-white transition cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
              {message}
            </p>

            <div className="mt-2 flex items-center justify-end gap-2">
              {!isAlert && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-neutral-300 transition hover:bg-white/[0.08] hover:text-white cursor-pointer"
                >
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-xl px-4 py-2 text-xs font-black text-white shadow-lg transition cursor-pointer ${
                  variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20'
                    : variant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 text-neutral-950 font-bold'
                    : 'bg-orange-500 hover:bg-orange-600 shadow-orange-500/20'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
