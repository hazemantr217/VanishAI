import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';

interface AspectRatioSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function AspectRatioPreviewIcon({ ratio, isSelected }: { ratio: string; isSelected?: boolean }) {
  if (ratio === 'original') {
    return (
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center border transition-all text-xs shadow-sm shrink-0",
        isSelected 
          ? "bg-purple-500/20 border-purple-500/40 text-purple-300" 
          : "bg-neutral-800/80 border-white/5 text-neutral-400"
      )}>
        🖼️
      </div>
    );
  }

  const parts = ratio.split(':');
  let w = 1;
  let h = 1;
  if (parts.length === 2) {
    w = Number(parts[0]) || 1;
    h = Number(parts[1]) || 1;
  }

  // Max box dimensions inside 32px (w-8) container are max 18px width/height
  const maxDim = 18;
  let boxWidth = maxDim;
  let boxHeight = maxDim;

  if (w > h) {
    boxHeight = maxDim * (h / w);
  } else if (h > w) {
    boxWidth = maxDim * (w / h);
  }

  // Ensure minimum size for visual feedback
  boxWidth = Math.max(boxWidth, 4);
  boxHeight = Math.max(boxHeight, 4);

  return (
    <div className={cn(
      "w-8 h-8 rounded-lg flex items-center justify-center border transition-all relative overflow-hidden bg-neutral-950/60 shadow-inner shrink-0",
      isSelected 
        ? "border-purple-500/40 text-purple-300" 
        : "border-white/5 text-neutral-500"
    )}>
      {/* Visual aspect ratio helper box */}
      <div 
        style={{ width: `${boxWidth}px`, height: `${boxHeight}px` }}
        className={cn(
          "rounded-sm border transition-all duration-200 flex items-center justify-center text-[7px] font-bold tracking-tighter overflow-hidden select-none",
          isSelected
            ? "border-purple-500 bg-purple-500/20 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.2)]"
            : "border-neutral-500/50 bg-neutral-800/40 text-neutral-400"
        )}
      >
        <span className="scale-[0.85] origin-center">{ratio}</span>
      </div>
    </div>
  );
}

function normalizeRatioInput(input: string): string {
  if (!input) return '';

  // Convert Arabic-Indic and Eastern Arabic-Indic numerals to Latin digits (0-9)
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const easternNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  
  let cleaned = input;
  for (let i = 0; i < 10; i++) {
    cleaned = cleaned.split(arabicNumerals[i]).join(i.toString());
    cleaned = cleaned.split(easternNumerals[i]).join(i.toString());
  }

  // Convert common ratio separators like slash '/' or 'x' or 'X' to ':'
  cleaned = cleaned.replace(/[\/xX]/g, ':');

  // Strip away any character that is NOT a digit (0-9) or colon (:)
  cleaned = cleaned.replace(/[^0-9:]/g, '');

  // Allow only one colon separator at most
  const parts = cleaned.split(':');
  if (parts.length > 2) {
    cleaned = parts[0] + ':' + parts.slice(1).join('');
  }

  return cleaned;
}

export default function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps) {
  // Keep track of what they typed for the custom aspect ratio, defaulting to "16:9"
  const [customInput, setCustomInput] = useState(() => {
    if (value !== 'original') return normalizeRatioInput(value) || '16:9';
    try {
      const savedCustom = localStorage.getItem('vanishai_custom_aspect_ratio');
      if (savedCustom) return normalizeRatioInput(savedCustom) || '16:9';
    } catch (e) {
      console.error(e);
    }
    return '16:9';
  });

  // Sync state if value changes externally (not to 'original')
  useEffect(() => {
    if (value !== 'original') {
      setCustomInput(normalizeRatioInput(value) || '16:9');
    }
  }, [value]);

  useEffect(() => {
    if (customInput) {
      try {
        localStorage.setItem('vanishai_custom_aspect_ratio', customInput);
      } catch (e) {
        console.error(e);
      }
    }
  }, [customInput]);

  const isOriginal = value === 'original';

  const handleInvertRatio = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    const parts = customInput.split(':').map(p => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const inverted = `${parts[1]}:${parts[0]}`;
      setCustomInput(inverted);
      onChange(inverted);
    }
  };

  const handleSelectOriginal = () => {
    if (disabled) return;
    onChange('original');
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const rawVal = e.target.value;
    const filteredVal = normalizeRatioInput(rawVal);
    
    setCustomInput(filteredVal);
    if (filteredVal) {
      onChange(filteredVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    // Allow navigation, control, and editing keys
    if (
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key === 'Tab' ||
      e.key === 'Escape' ||
      e.key === 'Enter' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    ) {
      return;
    }

    // Only allow single character keys that are digits, Arabic digits, colon, slash, or x
    if (e.key.length === 1) {
      const allowedRegex = /^[0-9٠-٩۰-۹:\/xX]$/;
      if (!allowedRegex.test(e.key)) {
        // Block text / alphabetical / symbol characters immediately
        e.preventDefault();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const filteredPasted = normalizeRatioInput(pastedText);
    
    // Replace current selection or append
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const currentVal = customInput;
    const nextVal = normalizeRatioInput(currentVal.slice(0, start) + filteredPasted + currentVal.slice(end));
    
    setCustomInput(nextVal);
    if (nextVal) {
      onChange(nextVal);
    }
  };

  const handleBlur = () => {
    if (disabled) return;
    // If empty on blur, fallback to '16:9'
    if (!customInput.trim()) {
      setCustomInput('16:9');
      onChange('16:9');
    }
  };

  const handleCustomFocus = () => {
    if (disabled) return;
    // Switch to custom mode when they focus/click the input field
    onChange(customInput || '16:9');
  };

  return (
    <div className="space-y-1.5 font-sans" dir="rtl">
      <div className="flex items-center gap-2">
        {/* Toggle Option 1: Original Dimensions */}
        <button
          type="button"
          disabled={disabled}
          onClick={handleSelectOriginal}
          className={cn(
            "h-10 px-4 rounded-xl border transition-all font-bold text-xs flex items-center gap-2 shrink-0 cursor-pointer select-none shadow-sm",
            isOriginal
              ? "bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-500/10"
              : "bg-neutral-900/90 border-white/10 text-neutral-400 hover:text-white hover:border-white/20 hover:bg-neutral-950"
          )}
        >
          <span>🖼️ الأبعاد الأصلية</span>
          {isOriginal && (
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          )}
        </button>

        {/* Toggle Option 2: Custom Dimensions Input */}
        <div 
          className={cn(
            "relative flex-1 flex items-center h-10 px-3 rounded-xl bg-neutral-900/90 border transition-all",
            !isOriginal
              ? "border-purple-500/60 ring-1 ring-purple-500/20 bg-neutral-950"
              : "border-white/10 hover:border-white/20 focus-within:border-white/30"
          )}
        >
          {/* Live Visual Aspect Ratio Helper Box inside the input */}
          <div className="pl-1 shrink-0">
            <AspectRatioPreviewIcon ratio={isOriginal ? '16:9' : customInput} isSelected={!isOriginal} />
          </div>

          <input
            type="text"
            dir="ltr"
            inputMode="numeric"
            pattern="[0-9:]*"
            disabled={disabled}
            value={customInput}
            onChange={handleCustomChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            onFocus={handleCustomFocus}
            placeholder="16:9"
            className="w-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 text-xs text-white text-left placeholder-neutral-500 font-bold px-2"
          />

          <button
            type="button"
            disabled={disabled}
            onClick={handleInvertRatio}
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded border select-none shrink-0 transition-all flex items-center gap-1 cursor-pointer",
              !isOriginal
                ? "bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30"
                : "bg-neutral-800 border-white/10 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            )}
            title="عكس الأبعاد (مثال: 16:9 إلى 9:16)"
          >
            🔄 عكس
          </button>
        </div>
      </div>

      {/* Helpful Hint Label beneath the inputs */}
      <div className="flex items-center justify-between text-[10px] text-neutral-500 px-1 font-medium">
        <span>أو اكتب أبعاداً يدوياً (مثال: <span className="text-neutral-400" dir="ltr">1:1</span>، <span className="text-neutral-400" dir="ltr">9:16</span>، <span className="text-neutral-400" dir="ltr">4:3</span>)</span>
        {!isOriginal && (
          <span className="text-purple-400/85 flex items-center gap-1 animate-fade-in">
            ⚡ وضع الأبعاد المخصصة نشط
          </span>
        )}
      </div>
    </div>
  );
}
