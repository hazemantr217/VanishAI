export interface BatchItem {
  id: string;
  initialImage: string;
  originalImage: string;
  editHistory: string[];
  redoEditHistory?: string[];
  maskedImage: string | null;
  dalleMaskImage?: string | null;
  maskOverlayImage?: string | null;
  resultImage: string | null;
  variants?: string[];
  activeVariantIndex?: number;
  inputImages?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  createdAt?: number;
}

export interface Preset {
  name: string;
  prompt: string;
  isCustom?: boolean;
}
