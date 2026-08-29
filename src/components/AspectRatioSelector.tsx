import type { AspectRatio } from '../shared/models';
import { SUPPORTED_ASPECT_RATIOS } from '../shared/models';
import { cn } from '../lib/utils';

interface AspectRatioSelectorProps {
  value: AspectRatio;
  onChange: (value: AspectRatio) => void;
  disabled?: boolean;
}

function AspectRatioPreviewIcon({ ratio }: { ratio: AspectRatio }) {
  if (ratio === 'original') return <span aria-hidden="true">🖼️</span>;
  const [width, height] = ratio.split(':').map(Number);
  const max = 18;
  const boxWidth = Math.max(5, width >= height ? max : max * (width / height));
  const boxHeight = Math.max(5, height >= width ? max : max * (height / width));

  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-sm border border-current bg-current/10"
      style={{ width: boxWidth, height: boxHeight }}
    />
  );
}

export default function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4" dir="rtl" role="radiogroup" aria-label="نسبة أبعاد الصورة">
      {SUPPORTED_ASPECT_RATIOS.map((ratio) => {
        const selected = value === ratio;
        return (
          <button
            key={ratio}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(ratio)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-purple-500 bg-purple-600 text-white shadow-md shadow-purple-500/10'
                : 'border-white/10 bg-neutral-900/90 text-neutral-400 hover:border-white/20 hover:text-white',
            )}
          >
            <AspectRatioPreviewIcon ratio={ratio} />
            <span dir="ltr">{ratio === 'original' ? 'الأصلية' : ratio}</span>
          </button>
        );
      })}
    </div>
  );
}
