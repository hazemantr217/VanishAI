const AI_STUDIO_PREVIEW_SUFFIX = '.scf.usercontent.goog';
const AI_STUDIO_CLOUD_RUN_HOST = /^ais-(?:dev|pre)-[a-z0-9-]+-\d+\.[a-z0-9-]+\.run\.app$/;
const AI_STUDIO_HOSTS = new Set([
  'aistudio.google.com',
  'ai.studio',
]);

function normalizeHostname(value: string | undefined): string {
  return (value || '').trim().toLowerCase().replace(/\.$/, '');
}

export function isGoogleAIStudioHostname(value: string | undefined): boolean {
  const hostname = normalizeHostname(value);
  if (!hostname) return false;
  if (AI_STUDIO_HOSTS.has(hostname)) return true;
  return (
    hostname.length > AI_STUDIO_PREVIEW_SUFFIX.length &&
    hostname.endsWith(AI_STUDIO_PREVIEW_SUFFIX)
  ) || AI_STUDIO_CLOUD_RUN_HOST.test(hostname);
}

export function isGoogleAIStudioUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      isGoogleAIStudioHostname(url.hostname);
  } catch {
    return false;
  }
}

export function isGoogleAIStudioBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isGoogleAIStudioHostname(window.location.hostname)) return true;
  if (typeof document !== 'undefined' && isGoogleAIStudioUrl(document.referrer)) return true;

  try {
    return Array.from(window.location.ancestorOrigins || [])
      .some((origin) => isGoogleAIStudioUrl(origin));
  } catch {
    return false;
  }
}
