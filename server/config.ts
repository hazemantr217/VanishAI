import type { Request } from 'express';

const MAX_API_KEY_LENGTH = 512;

function cleanSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const serverConfig = {
  // Use getters instead of startup snapshots. AI Studio can refresh managed
  // secrets while its preview server is being rebuilt, and the next request
  // must see the current value without relying on module re-evaluation.
  get managedGeminiApiKey(): string | null {
    return cleanSecret(process.env.GEMINI_API_KEY);
  },
  get managedOpenAIApiKey(): string | null {
    return cleanSecret(process.env.OPENAI_API_KEY);
  },
  redisUrl: cleanSecret(process.env.REDIS_URL),
  port: (() => {
    const parsed = Number(process.env.PORT || 3000);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 3000;
  })(),
  // Stable built-in limits keep AI Studio from treating optional tuning values
  // as required secrets. Large batches are queued at this concurrency.
  maxBatchConcurrency: 2,
  requestBodyLimit: '75mb',
};

// AI Studio injects GEMINI_API_KEY automatically. In that managed mode the app
// deliberately stays Google-only, even if an unrelated OpenAI secret exists.
export function isGoogleManagedRuntime(): boolean {
  return Boolean(serverConfig.managedGeminiApiKey);
}

export function isOpenAIEnabled(): boolean {
  return !isGoogleManagedRuntime() && Boolean(serverConfig.managedOpenAIApiKey);
}

function readSecretHeader(req: Request, headerName: string): string | null {
  const rawValue = req.header(headerName)?.trim();
  if (!rawValue || rawValue.length > MAX_API_KEY_LENGTH || /[\r\n]/.test(rawValue)) {
    return null;
  }
  return rawValue;
}

export function resolveGeminiApiKey(req: Request): string | null {
  return serverConfig.managedGeminiApiKey || readSecretHeader(req, 'x-gemini-api-key');
}

export function resolveOpenAIApiKey(req: Request): string | null {
  if (!isOpenAIEnabled()) return null;
  return serverConfig.managedOpenAIApiKey || readSecretHeader(req, 'x-openai-api-key');
}
