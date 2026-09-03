import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import type { Preset } from '../types';
import { DEFAULT_PRESETS } from '../data/default-presets';

const STORAGE_KEY = 'vanishai_all_presets';
const STORAGE_VERSION_KEY = 'vanishai_preset_library_version';
const PRESET_LIBRARY_VERSION = '2026-08-30-v2';

function persistPresets(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  localStorage.setItem(STORAGE_VERSION_KEY, PRESET_LIBRARY_VERSION);
}

function loadPresets(): Preset[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_PRESETS;
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    const validSaved = parsed
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .filter((value) => typeof value.name === 'string' && typeof value.prompt === 'string')
      .map((value): Preset => ({
        name: value.name as string,
        prompt: value.prompt as string,
        isCustom: value.isCustom === true,
      }));
    const defaultNames = new Set(DEFAULT_PRESETS.map((preset) => preset.name));
    const customPresets = validSaved.filter((preset) => preset.isCustom || !defaultNames.has(preset.name));
    const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    const existingNames = new Set(validSaved.map((preset) => preset.name));
    const merged = savedVersion === PRESET_LIBRARY_VERSION
      ? [...DEFAULT_PRESETS.filter((preset) => !existingNames.has(preset.name)), ...validSaved]
      : [...DEFAULT_PRESETS, ...customPresets];
    persistPresets(merged);
    return merged;
  } catch (error) {
    console.error('Error loading presets:', error);
    return DEFAULT_PRESETS;
  }
}

export function usePresets(prompt: string, selectedPresetName: string | null) {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetPrompt, setNewPresetPrompt] = useState('');
  const [showAddPresetFormSidebar, setShowAddPresetFormSidebar] = useState(false);
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null);
  const [editingPresetName, setEditingPresetName] = useState('');
  const [editingPresetPrompt, setEditingPresetPrompt] = useState('');

  const activePreset = useMemo(() => {
    const matched = presets.find((preset) => preset.prompt.trim() === prompt.trim());
    return selectedPresetName
      ? presets.find((preset) => preset.name === selectedPresetName && preset.prompt.trim() === prompt.trim()) || matched
      : matched;
  }, [presets, prompt, selectedPresetName]);
  const activePromptTitle = activePreset?.name || (prompt.trim() ? '✨ البرومبت المخصص' : '✍️ تخصيص البرومبت والنمط');

  const handleCancelEditPreset = useCallback(() => {
    setEditingPresetIndex(null);
    setEditingPresetName('');
    setEditingPresetPrompt('');
  }, []);

  const handleStartEditPreset = useCallback((index: number, event: MouseEvent) => {
    event.stopPropagation();
    setEditingPresetIndex(index);
    setEditingPresetName(presets[index].name);
    setEditingPresetPrompt(presets[index].prompt);
  }, [presets]);

  const handleSaveEditPreset = useCallback((index: number) => {
    if (!editingPresetName.trim() || !editingPresetPrompt.trim()) return;
    setPresets((previous) => {
      const updated = [...previous];
      updated[index] = { ...updated[index], name: editingPresetName.trim(), prompt: editingPresetPrompt.trim(), isCustom: true };
      persistPresets(updated);
      return updated;
    });
    handleCancelEditPreset();
  }, [editingPresetName, editingPresetPrompt, handleCancelEditPreset]);

  const handleMovePreset = useCallback((index: number, direction: 'up' | 'down', event: MouseEvent) => {
    event.stopPropagation();
    setPresets((previous) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) return previous;
      const updated = [...previous];
      [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
      persistPresets(updated);
      return updated;
    });
  }, []);

  const handleReorderPresets = useCallback((sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return;
    setPresets((previous) => {
      if (
        sourceIndex < 0 ||
        sourceIndex >= previous.length ||
        targetIndex < 0 ||
        targetIndex >= previous.length
      ) {
        return previous;
      }
      const updated = [...previous];
      const [movedItem] = updated.splice(sourceIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      persistPresets(updated);
      return updated;
    });
  }, []);

  const handleAddPreset = useCallback((name: string, promptText: string) => {
    if (!name.trim() || !promptText.trim()) return;
    setPresets((previous) => {
      const updated = [...previous, { name: name.trim(), prompt: promptText.trim(), isCustom: true }];
      persistPresets(updated);
      return updated;
    });
    setNewPresetName('');
    setNewPresetPrompt('');
    setShowAddPresetFormSidebar(false);
  }, []);

  const handleDeletePreset = useCallback((index: number) => {
    setPresets((previous) => {
      const updated = previous.filter((_preset, presetIndex) => presetIndex !== index);
      persistPresets(updated);
      return updated;
    });
    if (editingPresetIndex === index) handleCancelEditPreset();
  }, [editingPresetIndex, handleCancelEditPreset]);

  const handleResetPresets = useCallback(() => {
    if (!window.confirm('سيتم استعادة البرومبتات الافتراضية مع الاحتفاظ بكل البرومبتات المخصصة. هل تريد المتابعة؟')) return;
    setPresets((previous) => {
      const customPresets = previous.filter((preset) => preset.isCustom);
      const restored = [...DEFAULT_PRESETS, ...customPresets];
      persistPresets(restored);
      return restored;
    });
    handleCancelEditPreset();
  }, [handleCancelEditPreset]);

  return {
    presets,
    newPresetName,
    setNewPresetName,
    newPresetPrompt,
    setNewPresetPrompt,
    showAddPresetFormSidebar,
    setShowAddPresetFormSidebar,
    editingPresetIndex,
    editingPresetName,
    setEditingPresetName,
    editingPresetPrompt,
    setEditingPresetPrompt,
    activePreset,
    activePromptTitle,
    handleStartEditPreset,
    handleSaveEditPreset,
    handleCancelEditPreset,
    handleMovePreset,
    handleReorderPresets,
    handleAddPreset,
    handleDeletePreset,
    handleResetPresets,
  };
}
