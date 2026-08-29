import { useEffect, useRef } from 'react';
import type { BatchItem } from '../types';
import type { WorkSession } from '../lib/db';
import { cancelManagedImageUrlRevocation, scheduleManagedImageUrlRevocation } from '../lib/image-urls';

function collectItemUrls(item: BatchItem, urls: Set<string>): void {
  const candidates = [
    item.initialImage,
    item.originalImage,
    item.maskedImage,
    item.dalleMaskImage,
    item.maskOverlayImage,
    item.resultImage,
    ...(item.editHistory || []),
    ...(item.redoEditHistory || []),
    ...(item.variants || []),
    ...(item.inputImages || []),
  ];
  candidates.forEach((url) => {
    if (url) urls.add(url);
  });
}

export function useManagedImageLifecycle(
  activeItems: BatchItem[],
  archiveItems: BatchItem[],
  sessions: WorkSession[],
): void {
  const previousUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const retainedUrls = new Set<string>();
    activeItems.forEach((item) => collectItemUrls(item, retainedUrls));
    archiveItems.forEach((item) => collectItemUrls(item, retainedUrls));
    sessions.forEach((session) => session.items.forEach((item) => collectItemUrls(item, retainedUrls)));

    retainedUrls.forEach(cancelManagedImageUrlRevocation);
    previousUrlsRef.current.forEach((url) => {
      if (!retainedUrls.has(url)) scheduleManagedImageUrlRevocation(url);
    });
    previousUrlsRef.current = retainedUrls;
  }, [activeItems, archiveItems, sessions]);
}
