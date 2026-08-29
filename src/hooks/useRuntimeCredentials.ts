import { useCallback, useEffect, useState } from 'react';
import type { RuntimeConfig } from '../shared/api';
import {
  clearSessionGeminiApiKey,
  getRuntimeConfig,
  hasSessionGeminiApiKey,
  setSessionGeminiApiKey,
} from '../services/api';

const FALLBACK_RUNTIME_CONFIG: RuntimeConfig = {
  geminiCredentialMode: 'byok',
  googleOnlyMode: false,
  openaiAvailable: false,
  geminiImageBillingRequired: true,
  maxBatchConcurrency: 2,
};

export function useRuntimeCredentials() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [runtimeConfigError, setRuntimeConfigError] = useState('');
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [hasUserApiKey, setHasUserApiKey] = useState(() => hasSessionGeminiApiKey());

  useEffect(() => {
    const controller = new AbortController();
    void getRuntimeConfig(controller.signal).then((config) => {
      setRuntimeConfig(config);
      setRuntimeConfigError('');
      if (config.geminiCredentialMode === 'byok' && !hasSessionGeminiApiKey()) {
        setShowApiKeyDialog(true);
      }
    }).catch((error) => {
      if (error instanceof Error && error.name === 'AbortError') return;
      setRuntimeConfig(FALLBACK_RUNTIME_CONFIG);
      setRuntimeConfigError('تعذر قراءة إعدادات الخادم. أعد تحميل الصفحة إذا استمرت المشكلة.');
      if (!hasSessionGeminiApiKey()) setShowApiKeyDialog(true);
    });
    return () => controller.abort();
  }, []);

  const requiresUserApiKey = runtimeConfig?.geminiCredentialMode === 'byok';

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
    ensureCredentials,
    handleSaveApiKey,
    handleForgetApiKey,
  };
}
