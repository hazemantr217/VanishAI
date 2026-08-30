import { useEffect, useState } from 'react';
import { ArrowLeftRight, Check, Image as ImageIcon } from 'lucide-react';
import type { AspectRatio } from '../shared/models';
import { isSupportedAspectRatio } from '../shared/models';
import { cn } from '../lib/utils';

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  disabled?: boolean;
}

function greatestCommonDivisor(first: number, second: number): number {
  let left = Math.abs(first);
  let right = Math.abs(second);
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

export function normalizeAspectRatioInput(input: string): string | null {
  const match = /^\s*(\d{1,3})\s*[:x×/]\s*(\d{1,3})\s*$/i.exec(input);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 1 || height < 1) return null;
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

export default function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps) {
  const [draft, setDraft] = useState(value === 'original' ? '' : value);
  const normalized = normalizeAspectRatioInput(draft);
  const supported = Boolean(normalized && isSupportedAspectRatio(normalized));

  useEffect(() => {
    setDraft(value === 'original' ? '' : value);
  }, [value]);

  const applyDraft = () => {
    if (normalized && isSupportedAspectRatio(normalized)) {
      setDraft(normalized);
      onChange(normalized);
    }
  };

  const reverse = () => {
    if (!normalized) return;
    const [width, height] = normalized.split(':');
    const reversed = `${height}:${width}`;
    setDraft(reversed);
    if (isSupportedAspectRatio(reversed)) onChange(reversed);
  };

  return (
    <div className="space-y-2" dir="rtl">
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 rounded-2xl border border-white/10 bg-black/25 p-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange('original')}
          className={cn(
            'flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition disabled:opacity-40',
            value === 'original'
              ? 'border-purple-400/50 bg-purple-500/20 text-purple-100'
              : 'border-white/10 bg-white/5 text-neutral-400 hover:text-white',
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" /> الأصلية
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyDraft();
          }}
          placeholder="مثال 3:4"
          aria-label="اكتب نسبة الأبعاد"
          className={cn(
            'h-10 min-w-0 rounded-xl border bg-neutral-950 px-3 text-center font-mono text-sm font-bold text-white outline-none transition placeholder:text-neutral-600 disabled:opacity-40',
            draft && !supported ? 'border-red-500/50 focus:border-red-400' : 'border-white/10 focus:border-purple-500',
          )}
          dir="ltr"
        />
        <button
          type="button"
          disabled={disabled || !normalized}
          onClick={reverse}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-300 transition hover:border-purple-500/40 hover:text-purple-200 disabled:opacity-30"
          title="عكس النسبة"
          aria-label="عكس نسبة الأبعاد"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={disabled || !supported}
          onClick={applyDraft}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 text-white shadow-lg shadow-purple-500/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
          title="تطبيق النسبة"
          aria-label="تطبيق نسبة الأبعاد"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
      <p className={cn('px-1 text-[9px] leading-relaxed', draft && !supported ? 'text-red-300' : 'text-neutral-500')}>
        {draft && !supported
          ? 'هذه النسبة غير مدعومة مباشرة. جرّب مثلًا 1:1 أو 3:4 أو 4:3 أو 9:16 أو 16:9.'
          : value === 'original'
            ? 'سيُحافظ على أبعاد الصورة الأصلية.'
            : <>النسبة المطبقة: <strong dir="ltr" className="text-purple-300">{value}</strong></>}
      </p>
    </div>
  );
}
