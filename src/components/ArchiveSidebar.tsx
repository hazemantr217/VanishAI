import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  FolderArchive,
  Image as ImageIcon,
  Images,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
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

function formatRelativeDate(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return new Date(timestamp).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
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
  const completedActive = activeItems.filter((item) => item.status === 'completed').length;

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
            className="fixed inset-0 z-[49] bg-black/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: 460, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 230 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col overflow-hidden border-l border-white/10 bg-neutral-950/95 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:w-[440px]"
            dir="rtl"
          >
            <header className="relative overflow-hidden border-b border-white/10 px-5 pb-4 pt-5">
              <div className="absolute inset-0 bg-gradient-to-bl from-purple-700/25 via-blue-700/10 to-transparent" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/15 text-purple-200 shadow-lg shadow-purple-500/10">
                    <Archive className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white">مساحة العمل المحفوظة</h2>
                    <p className="mt-1 text-[10px] leading-relaxed text-neutral-400">ارجع إلى جلسة كاملة أو أضف صورة محفوظة للعمل الحالي.</p>
                  </div>
                </div>
                <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-black/20 p-2 text-neutral-400 transition hover:bg-white/10 hover:text-white" aria-label="إغلاق">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <Stat label="الجلسات" value={sessions.length} icon={FolderArchive} />
                <Stat label="المكتبة" value={archiveItems.length} icon={Images} />
                <Stat label="مكتملة الآن" value={completedActive} icon={CheckCircle2} />
              </div>
            </header>

            <div className="grid grid-cols-2 gap-1.5 border-b border-white/5 bg-black/20 p-2">
              <TabButton active={tab === 'sessions'} onClick={() => onTabChange('sessions')} icon={FolderArchive} label="جلسات العمل" count={sessions.length} />
              <TabButton active={tab === 'images'} onClick={() => onTabChange('images')} icon={ImageIcon} label="مكتبة الصور" count={archiveItems.length} />
            </div>

            {tab === 'sessions' ? (
              <section className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-white/5 bg-white/[0.025] p-3">
                  <button type="button" onClick={onSaveSession} disabled={activeItems.length === 0} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-xs font-black text-white shadow-lg shadow-purple-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35">
                    <Save className="h-4 w-4" /> حفظ نقطة رجوع الآن · {activeItems.length} صورة
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[9px] text-neutral-500">
                    <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> آخر 5 جلسات · الاحتفاظ 3 أيام</span>
                    {sessions.length > 0 && <button type="button" onClick={onClearSessions} className="font-bold text-red-400 transition hover:text-red-300">مسح الجلسات</button>}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {sessions.map((session, index) => {
                    const isCurrent = session.id === currentSessionId;
                    const progress = session.itemCount > 0 ? Math.round((session.completedCount / session.itemCount) * 100) : 0;
                    return (
                      <article key={session.id} className={cn('overflow-hidden rounded-2xl border bg-white/[0.035] transition', isCurrent ? 'border-purple-400/40 ring-1 ring-purple-500/10' : 'border-white/8 hover:border-white/15')}>
                        <div className="p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="truncate text-xs font-black text-white">{session.name || `جلسة العمل ${sessions.length - index}`}</h3>
                                {isCurrent && <span className="shrink-0 rounded-md bg-purple-500/15 px-1.5 py-0.5 text-[8px] font-bold text-purple-300">الحالية</span>}
                              </div>
                              <p className="mt-1 text-[9px] text-neutral-500">{formatRelativeDate(session.updatedAt)} · {session.itemCount} صورة</p>
                            </div>
                            <span className="rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-[9px] font-bold text-neutral-300">{progress}%</span>
                          </div>

                          <div className="mt-3 grid h-20 grid-cols-4 gap-1.5 overflow-hidden rounded-xl bg-black/30 p-1.5">
                            {session.previewThumbnails.slice(0, 4).map((url, previewIndex) => (
                              <img key={`${session.id}-${previewIndex}`} src={url} alt={`معاينة ${previewIndex + 1}`} className="h-full min-w-0 rounded-lg object-cover" />
                            ))}
                          </div>

                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-white/5 bg-black/20 p-2.5">
                          <button type="button" onClick={() => onRestoreSession(session)} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/8 text-[11px] font-bold text-white transition hover:bg-purple-600">
                            <RotateCcw className="h-3.5 w-3.5" /> فتح الجلسة
                          </button>
                          <button type="button" onClick={() => onDeleteSession(session.id)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/[0.06] text-red-400 transition hover:bg-red-500/15" aria-label="حذف الجلسة">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {sessions.length === 0 && <EmptyState icon={FolderArchive} title="لا توجد نقاط رجوع بعد" detail="احفظ الجلسة الحالية لتستعيد الصور والتعديلات معًا." />}
                </div>
              </section>
            ) : (
              <section className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.025] p-3">
                  <button type="button" onClick={onRestoreAllImages} disabled={archiveItems.length === 0} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-xs font-black text-white shadow-lg shadow-purple-500/15 disabled:opacity-35">
                    <Download className="h-4 w-4" /> إضافة الكل للعمل · {archiveItems.length}
                  </button>
                  {archiveItems.length > 0 && <button type="button" onClick={onClearImages} className="h-10 rounded-xl border border-red-500/20 bg-red-500/[0.07] px-3 text-[10px] font-bold text-red-400 hover:bg-red-500/15">تفريغ</button>}
                </div>
                <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-4">
                  {archiveItems.map((item, index) => {
                    const active = activeIds.has(item.id);
                    return (
                      <article key={item.id} className={cn('group overflow-hidden rounded-2xl border bg-white/[0.035]', active ? 'border-purple-500/40' : 'border-white/8 hover:border-white/15')}>
                        <div className="relative aspect-square overflow-hidden bg-black/40">
                          <img src={item.resultImage || item.originalImage} alt={`صورة محفوظة ${archiveItems.length - index}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" />
                          {active && <span className="absolute right-2 top-2 rounded-lg border border-purple-400/20 bg-purple-700/80 px-2 py-1 text-[8px] font-bold text-white backdrop-blur">في مساحة العمل</span>}
                          <button type="button" onClick={() => onDeleteImage(item.id)} className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl border border-red-400/20 bg-red-950/80 text-red-300 opacity-0 backdrop-blur transition hover:bg-red-600 hover:text-white group-hover:opacity-100" aria-label="حذف الصورة">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="p-2.5">
                          <div className="mb-2 flex items-center justify-between gap-2 text-[9px] text-neutral-500">
                            <span>صورة #{archiveItems.length - index}</span>
                            <span>{formatRelativeDate(item.createdAt || Date.now())}</span>
                          </div>
                          <button type="button" onClick={() => onActivateImage(item)} className={cn('flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[10px] font-bold transition', active ? 'border border-purple-500/20 bg-purple-500/10 text-purple-300' : 'bg-white/8 text-white hover:bg-purple-600')}>
                            {active ? <><CheckCircle2 className="h-3 w-3" /> مضافة بالفعل</> : <><Sparkles className="h-3 w-3" /> إضافة للعمل</>}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {archiveItems.length === 0 && <div className="col-span-2"><EmptyState icon={ImageIcon} title="مكتبة الصور فارغة" detail="ستظهر هنا آخر الصور المستخدمة تلقائيًا." /></div>}
                </div>
              </section>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Archive }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 px-2.5 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[8px] font-bold text-neutral-500"><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-1 text-base font-black text-white">{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: typeof Archive; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex h-10 items-center justify-center gap-2 rounded-xl border text-[11px] font-bold transition', active ? 'border-purple-500/30 bg-purple-500/15 text-purple-200' : 'border-transparent text-neutral-400 hover:bg-white/5 hover:text-white')}>
      <Icon className="h-3.5 w-3.5" /> {label} <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[9px]">{count}</span>
    </button>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Archive; title: string; detail: string }) {
  return (
    <div className="px-5 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/8 bg-white/[0.035] text-neutral-600"><Icon className="h-6 w-6" /></div>
      <p className="mt-3 text-xs font-black text-neutral-300">{title}</p>
      <p className="mx-auto mt-1 max-w-[240px] text-[10px] leading-relaxed text-neutral-500">{detail}</p>
    </div>
  );
}

export default memo(ArchiveSidebar);
