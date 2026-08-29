import type { Request } from 'express';

const MAX_API_KEY_LENGTH = 512;

function cleanSecret(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requestBodyLimit(value: string | undefined): string {
  const match = /^(\d+)(kb|mb)$/i.exec(value?.trim() || '');
  if (!match) return '75mb';
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === 'mb') return `${Math.min(100, Math.max(1, amount))}mb`;
  return `${Math.min(102_400, Math.max(64, amount))}kb`;
}

export const serverConfig = {
  managedGeminiApiKey: cleanSecret(process.env.GEMINI_API_KEY),
  managedOpenAIApiKey: cleanSecret(process.env.OPENAI_API_KEY),
  port: (() => {
    const parsed = Number(process.env.PORT || 3000);
    return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535 ? parsed : 3000;
  })(),
  maxBatchConcurrency: Math.min(
    4,
    Math.max(1, Number.parseInt(process.env.MAX_BATCH_CONCURRENCY || '2', 10) || 2),
  ),
  requestBodyLimit: requestBodyLimit(process.env.REQUEST_BODY_LIMIT),
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
