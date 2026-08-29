import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Database, Download, FolderArchive, Image as ImageIcon, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { BatchItem } from '../types';
import type { WorkSession } from '../lib/db';
import { cn } from '../lib/utils';

interface ArchiveSidebarProps {
  open: boolean;
  tab: 'sessions' | 'images';
  onTabChange: (tab: 'sessions' | 'images') => void;
  onClose: () => void;
  sessions: WorkSession[];
  currentSessionId: string;
  activeItems: BatchItem[];
  archiveItems: BatchItem[];
  onSaveSession: () => void;
  onClearSessions: () => void;
  onRestoreSession: (session: WorkSession) => void;
  onDeleteSession: (sessionId: string) => void;
  onRestoreAllImages: () => void;
  onClearImages: () => void;
  onActivateImage: (item: BatchItem) => void;
  onDeleteImage: (itemId: string) => void;
}

function ArchiveSidebar({
  open,
  tab,
  onTabChange,
  onClose,
  sessions,
  currentSessionId,
  activeItems,
  archiveItems,
  onSaveSession,
  onClearSessions,
  onRestoreSession,
  onDeleteSession,
  onRestoreAllImages,
  onClearImages,
  onActivateImage,
  onDeleteImage,
}: ArchiveSidebarProps) {
  const activeIds = new Set(activeItems.map((item) => item.id));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="إغلاق الأرشيف"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[49] bg-black/60 lg:hidden"
          />
          <motion.aside
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 right-0 top-16 z-50 flex w-full shrink-0 flex-col border-l border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl sm:w-96"
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-black/30 p-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-bold">الأرشيف وجلسات العمل</h2>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="إغلاق">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex gap-1.5 border-b border-white/5 bg-black/20 p-2">
              {(['sessions', 'images'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onTabChange(value)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition',
                    tab === value
                      ? 'border-purple-500/40 bg-purple-600/30 text-purple-200'
                      : 'border-transparent text-neutral-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  {value === 'sessions' ? <FolderArchive className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  {value === 'sessions' ? `الجلسات (${sessions.length})` : `الصور (${archiveItems.length})`}
                </button>
              ))}
            </div>

            {tab === 'sessions' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="space-y-2 border-b border-white/5 bg-neutral-950/40 p-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={onSaveSession} disabled={activeItems.length === 0} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-600/20 px-2.5 py-1.5 text-xs font-bold text-purple-200 disabled:opacity-40">
                      <Save className="h-3.5 w-3.5" /> حفظ الحالية ({activeItems.length})
                    </button>
                    {sessions.length > 0 && (
                      <button type="button" onClick={onClearSessions} className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/20">
                        مسح الكل
                      </button>
                    )}
                  </div>
                  <p className="flex items-start gap-1.5 rounded-lg border border-purple-500/15 bg-purple-950/20 p-2 text-[10px] leading-relaxed text-purple-300/80">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> آخر 5 جلسات تُحفظ تلقائيًا وتُحذف بعد 3 أيام.
                  </p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {sessions.map((session, index) => (
                    <article key={session.id} className={cn('space-y-3 rounded-xl border bg-white/5 p-3', session.id === currentSessionId ? 'border-purple-500/30 bg-purple-500/10' : 'border-white/5')}>
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold">جلسة #{index + 1} · {session.itemCount} صورة</h3>
                          <p className="mt-0.5 text-[9px] text-neutral-500">{new Date(session.updatedAt).toLocaleString('ar-EG')}</p>
                        </div>
                        <span className="text-[9px] text-neutral-400">مكتمل {session.completedCount}/{session.itemCount}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 rounded-lg bg-black/40 p-1">
                        {session.previewThumbnails.slice(0, 4).map((url, previewIndex) => (
                          <img key={`${url}-${previewIndex}`} src={url} alt="" className="aspect-square w-full rounded object-cover" />
                        ))}
                      </div>
                      <div className="flex gap-2 border-t border-white/5 pt-2">
                        <button type="button" onClick={() => onRestoreSession(session)} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-bold text-white">
                          <RotateCcw className="h-3.5 w-3.5" /> استعادة
                        </button>
                        <button type="button" onClick={() => onDeleteSession(session.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400" aria-label="حذف الجلسة">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </article>
                  ))}
                  {sessions.length === 0 && <EmptyState icon={FolderArchive} title="لا توجد جلسات محفوظة" />}
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex gap-2 border-b border-white/5 bg-neutral-950/40 p-3">
                  <button type="button" onClick={onRestoreAllImages} disabled={archiveItems.length === 0} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                    <Download className="h-3.5 w-3.5" /> استعادة الكل ({archiveItems.length})
                  </button>
                  {archiveItems.length > 0 && <button type="button" onClick={onClearImages} className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 text-xs text-red-400">تفريغ</button>}
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {archiveItems.map((item, index) => {
                    const active = activeIds.has(item.id);
                    return (
                      <article key={item.id} className="space-y-2 rounded-xl border border-white/5 bg-white/5 p-3">
                        <div className="flex gap-3">
                          <img src={item.resultImage || item.originalImage} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                          <div className="min-w-0 flex-1 self-center">
                            <p className="truncate text-xs font-semibold">صورة محفوظة #{archiveItems.length - index}</p>
                            <p className="mt-1 text-[10px] text-neutral-500">{new Date(item.createdAt || Date.now()).toLocaleDateString('ar-EG')}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-white/5 pt-2">
                          <button type="button" onClick={() => onActivateImage(item)} className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-bold', active ? 'border border-purple-500/30 bg-purple-600/15 text-purple-300' : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white')}>
                            {active ? 'نشطة حاليًا ✓' : 'إضافة للعمل'}
                          </button>
                          <button type="button" onClick={() => onDeleteImage(item.id)} className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400" aria-label="حذف الصورة">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {archiveItems.length === 0 && <EmptyState icon={ImageIcon} title="لا توجد صور محفوظة" />}
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyState({ icon: Icon, title }: { icon: typeof ImageIcon; title: string }) {
  return (
    <div className="px-2 py-12 text-center text-neutral-400">
      <Icon className="mx-auto mb-2 h-8 w-8 text-neutral-600" />
      <p className="text-xs font-bold text-neutral-300">{title}</p>
    </div>
  );
}

export default memo(ArchiveSidebar);
