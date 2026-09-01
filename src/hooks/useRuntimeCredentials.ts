import { useCallback, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../shared/api';
import {
  clearSessionGeminiApiKey,
  getRuntimeConfig,
  hasSessionGeminiApiKey,
  setSessionGeminiApiKey,
} from '../services/api';
import { isGoogleAIStudioBrowser } from '../shared/ai-studio';

const FALLBACK_RUNTIME_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'managed',
  googleOnlyMode: true,
  openaiAvailable: false,
};

export function runtimeRequiresUserApiKey(config: RuntimeConfig | null, aiStudioBrowser = false): boolean {
  return !aiStudioBrowser && config?.geminiCredentialMode === 'byok';
}

export function useRuntimeCredentials() {
  const aiStudioBrowser = isGoogleAIStudioBrowser();
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [runtimeConfigError, setRuntimeConfigError] = useState('');
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [hasUserApiKey, setHasUserApiKey] = useState(() => !aiStudioBrowser && hasSessionGeminiApiKey());

  useEffect(() => {
    if (!aiStudioBrowser) return;
    clearSessionGeminiApiKey();
    setHasUserApiKey(false);
    setShowApiKeyDialog(false);
  }, [aiStudioBrowser]);

  useEffect(() => {
    const controller = new AbortController();
    void getRuntimeConfig(controller.signal).then((config) => {
      setRuntimeConfig(config);
      setRuntimeConfigError('');
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setRuntimeConfig(FALLBACK_RUNTIME_CONFIG);
      setRuntimeConfigError('تعذر قراءة إعدادات الخادم. أعد تحميل الصفحة إذا استمرت المشكلة.');
    });
    return () => controller.abort();
  }, []);

  const requiresUserApiKey = runtimeRequiresUserApiKey(runtimeConfig, aiStudioBrowser);
  const managedGeminiMode = aiStudioBrowser || runtimeConfig?.geminiCredentialMode === 'managed';

  const ensureCredentials = useCallback(() => {
    if (requiresUserApiKey && !hasSessionGeminiApiKey()) {
      setShowApiKeyDialog(true);
      return false;
    }
    return true;
  }, [requiresUserApiKey]);

  const handleSaveApiKey = useCallback((apiKey: string) => {
    setSessionGeminiApiKey(apiKey);
    setHasUserApiKey(true);
    setShowApiKeyDialog(false);
  }, []);

  const handleForgetApiKey = useCallback(() => {
    clearSessionGeminiApiKey();
    setHasUserApiKey(false);
    if (requiresUserApiKey) setShowApiKeyDialog(true);
  }, [requiresUserApiKey]);

  return {
    runtimeConfig,
    runtimeConfigError,
    setRuntimeConfigError,
    showApiKeyDialog,
    setShowApiKeyDialog,
    hasUserApiKey,
    requiresUserApiKey,
    managedGeminiMode,
    ensureCredentials,
    handleSaveApiKey,
    handleForgetApiKey,
  };
}
