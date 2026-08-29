import { useEffect, useState, type RefObject } from 'react';
import type { BatchItem } from '../types';
import {
  initializeDatabase,
  MAX_ARCHIVE_CAPACITY,
  MAX_SESSIONS_COUNT,
  saveAllItems,
  saveWorkSession,
  type WorkSession,
} from '../lib/db';

export function usePersistentWorkspace(
  items: BatchItem[],
  currentSessionId: string,
  currentSessionCreatedAtRef: RefObject<number>,
) {
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [dbItems, setDbItems] = useState<BatchItem[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    void initializeDatabase().then(({ items: loadedItems, sessions: loadedSessions }) => {
      if (cancelled) return;
      const baseTime = Date.now();
      setDbItems(loadedItems.map((item, index) => ({
        ...item,
        createdAt: item.createdAt ?? baseTime - index * 1_000,
      })));
      setSessions(loadedSessions);
    }).catch((error) => {
      console.error('Error initializing persistent database:', error);
    }).finally(() => {
      if (!cancelled) setIsDbLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isDbLoaded) return;
    if (dbItems.length > MAX_ARCHIVE_CAPACITY) {
      setDbItems((previous) => previous.slice(0, MAX_ARCHIVE_CAPACITY));
      return;
    }
    const timer = window.setTimeout(() => {
      void saveAllItems(dbItems).catch((error) => {
        console.error('Failed to persist the image archive:', error);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dbItems, isDbLoaded]);

  useEffect(() => {
    if (!isDbLoaded || items.length === 0) return;
    setDbItems((previous) => {
      const activeIds = new Set(items.map((item) => item.id));
      return [...items, ...previous.filter((item) => !activeIds.has(item.id))].slice(0, MAX_ARCHIVE_CAPACITY);
    });
  }, [items, isDbLoaded]);

  useEffect(() => {
    if (!isDbLoaded || items.length === 0) return;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const session: WorkSession = {
        id: currentSessionId,
        name: `جلسة عمل (${items.length} صورة)`,
        createdAt: currentSessionCreatedAtRef.current || now,
        updatedAt: now,
        itemCount: items.length,
        completedCount: items.filter((item) => item.status === 'completed').length,
        previewThumbnails: items.slice(0, 4).map((item) => item.resultImage || item.originalImage),
        items,
      };
      void saveWorkSession(session).then(() => {
        setSessions((previous) => [
          session,
          ...previous.filter((stored) => stored.id !== session.id),
        ].slice(0, MAX_SESSIONS_COUNT));
      }).catch((error) => {
        console.error('Failed to auto-save work session:', error);
      });
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [items, isDbLoaded, currentSessionId, currentSessionCreatedAtRef]);

  return { isDbLoaded, dbItems, setDbItems, sessions, setSessions };
}
