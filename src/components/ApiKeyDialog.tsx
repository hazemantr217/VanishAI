import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import { verifyGeminiApiKey } from '../services/api';

interface ApiKeyDialogProps {
  open: boolean;
  required: boolean;
  onClose: () => void;
  onSave: (apiKey: string) => void;
}

export default function ApiKeyDialog({ open, required, onClose, onSave }: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  const handleSave = async () => {
    const value = apiKey.trim();
    if (value.length < 20) {
      setError('المفتاح قصير أو غير مكتمل. انسخه كاملًا من Google AI Studio.');
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsVerifying(true);
    setError('');
    try {
      await verifyGeminiApiKey(value, abortRef.current.signal);
      onSave(value);
      setApiKey('');
    } catch (verificationError) {
      if (verificationError instanceof Error && verificationError.name === 'AbortError') return;
      setError(verificationError instanceof Error
        ? verificationError.message
        : 'تعذر التحقق من المفتاح.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" dir="rtl">
      <div className="w-full max-w-lg rounded-2xl border border-purple-500/25 bg-neutral-950 p-5 shadow-2xl shadow-purple-950/40">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-2.5 text-purple-300">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">مفتاح Gemini API</h2>
              <p className="mt-1 text-xs leading-relaxed text-neutral-400">
                هذه النسخة تعمل خارج Google AI Studio، لذلك استخدم مفتاح حسابك أنت.
              </p>
            </div>
          </div>
          {!required && (
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-neutral-500 hover:bg-white/5 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="relative">
          <input
            autoFocus
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value);
              setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isVerifying) void handleSave();
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="الصق مفتاح Gemini هنا"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 pl-11 text-left font-mono text-sm text-white outline-none transition focus:border-purple-500"
            dir="ltr"
          />
          <button
            type="button"
            onClick={() => setShowKey((value) => !value)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-500 hover:text-white"
            aria-label={showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">{error}</p>
        )}

        <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 text-[11px] leading-relaxed text-neutral-400">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            حماية المفتاح
          </div>
          يُحفظ داخل جلسة هذا التبويب فقط، ولا يُكتب في المشروع أو قاعدة البيانات أو سجلات الخادم.
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="text-center text-xs font-semibold text-purple-300 hover:text-purple-200"
          >
            إنشاء مفتاح من Google AI Studio ↗
          </a>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isVerifying || !apiKey.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {isVerifying ? 'جاري التحقق...' : 'تحقق واستخدم المفتاح'}
          </button>
        </div>
      </div>
    </div>
  );
}
