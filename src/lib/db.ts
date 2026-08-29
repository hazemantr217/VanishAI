// IndexedDB Utility for VanishAI
// Handles offline-first image persistence with automatic 7-day expiration for individual images (up to 100 images)
// and automatic 3-day expiration for up to 5 complete work sessions.

const DB_NAME = 'VanishAIDatabase';
const STORE_NAME = 'items';
const SESSIONS_STORE_NAME = 'sessions';
const DB_VERSION = 2;

export const MAX_ARCHIVE_CAPACITY = 100;
export const MAX_SESSIONS_COUNT = 5;
export const SESSION_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms
export const ARCHIVE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export interface BatchItem {
  id: string;
  initialImage: string;
  originalImage: string;
  editHistory: string[];
  redoEditHistory?: string[];
  maskedImage: string | null;
  resultImage: string | null;
  variants?: string[];
  activeVariantIndex?: number;
  inputImages?: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  errorMessage?: string;
  createdAt?: number;
}

export interface WorkSession {
  id: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  completedCount: number;
  previewThumbnails: string[];
  items: BatchItem[];
}

// Check if IndexedDB is supported in the current environment
const isSupported = typeof window !== 'undefined' && 'indexedDB' in window;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isSupported) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
        db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Completely clears the IndexedDB items store.
 */
export async function clearDatabase(): Promise<void> {
  if (!isSupported) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear database:', error);
  }
}

/**
 * Loads all items from the database in the exact saved order (up to MAX_ARCHIVE_CAPACITY).
 */
export async function loadAllItems(): Promise<BatchItem[]> {
  if (!isSupported) return [];
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const result = request.result || [];
        result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(result.slice(0, MAX_ARCHIVE_CAPACITY));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load items from database:', error);
    return [];
  }
}

/**
 * Saves all items to the database (up to MAX_ARCHIVE_CAPACITY).
 */
export async function saveAllItems(items: BatchItem[]): Promise<void> {
  if (!isSupported) return;
  try {
    const itemsToSave = items.slice(0, MAX_ARCHIVE_CAPACITY);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const clearRequest = store.clear();
      clearRequest.onsuccess = () => {
        if (itemsToSave.length === 0) {
          resolve();
          return;
        }

        let count = 0;
        let failed = false;

        itemsToSave.forEach((item) => {
          const putRequest = store.put(item);
          putRequest.onsuccess = () => {
            count++;
            if (count === itemsToSave.length && !failed) {
              resolve();
            }
          };
          putRequest.onerror = () => {
            failed = true;
            reject(putRequest.error);
          };
        });
      };
      
      clearRequest.onerror = () => reject(clearRequest.error);
    });
  } catch (error) {
    console.error('Failed to save items to database:', error);
  }
}

// ==========================================
// WORK SESSIONS STORAGE (Last 5 Sessions + 3-Day Expiry)
// ==========================================

/**
 * Loads all work sessions, filters out any older than 3 days, and keeps up to 5 sessions.
 */
export async function loadAllSessions(): Promise<WorkSession[]> {
  if (!isSupported) return [];
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = async () => {
        const rawSessions: WorkSession[] = request.result || [];
        const now = Date.now();
        
        // Filter out expired sessions (> 3 days)
        const validSessions: WorkSession[] = [];
        const expiredIds: string[] = [];

        rawSessions.forEach(session => {
          const sessionTime = session.updatedAt || session.createdAt || 0;
          if (now - sessionTime > SESSION_EXPIRATION_MS) {
            expiredIds.push(session.id);
          } else {
            validSessions.push(session);
          }
        });

        // Delete expired sessions from store
        if (expiredIds.length > 0) {
          expiredIds.forEach(id => store.delete(id));
        }

        // Sort newest first
        validSessions.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

        // Enforce max 5 sessions
        const finalSessions = validSessions.slice(0, MAX_SESSIONS_COUNT);
        
        // If there were extra older sessions beyond 5, clean them up
        if (validSessions.length > MAX_SESSIONS_COUNT) {
          const toRemove = validSessions.slice(MAX_SESSIONS_COUNT);
          toRemove.forEach(s => store.delete(s.id));
        }

        resolve(finalSessions);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load sessions from database:', error);
    return [];
  }
}

/**
 * Saves or updates a work session, keeping at most 5 latest sessions.
 */
export async function saveWorkSession(session: WorkSession): Promise<void> {
  if (!isSupported || !session.items || session.items.length === 0) return;
  try {
    const existingSessions = await loadAllSessions();
    const existingIndex = existingSessions.findIndex(s => s.id === session.id);

    let updatedList: WorkSession[] = [];
    if (existingIndex > -1) {
      updatedList = [
        { ...session, updatedAt: Date.now() },
        ...existingSessions.filter(s => s.id !== session.id)
      ];
    } else {
      updatedList = [
        { ...session, updatedAt: Date.now() },
        ...existingSessions
      ];
    }

    // Keep only last 5 sessions
    const trimmed = updatedList.slice(0, MAX_SESSIONS_COUNT);

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE_NAME);

      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        let count = 0;
        let failed = false;

        trimmed.forEach(s => {
          const putReq = store.put(s);
          putReq.onsuccess = () => {
            count++;
            if (count === trimmed.length && !failed) {
              resolve();
            }
          };
          putReq.onerror = () => {
            failed = true;
            reject(putReq.error);
          };
        });
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
  } catch (error) {
    console.error('Failed to save session:', error);
  }
}

/**
 * Deletes a specific session by ID.
 */
export async function deleteWorkSession(sessionId: string): Promise<void> {
  if (!isSupported) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE_NAME);
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to delete session:', error);
  }
}

/**
 * Completely clears all saved sessions.
 */
export async function clearAllWorkSessions(): Promise<void> {
  if (!isSupported) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SESSIONS_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SESSIONS_STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear sessions:', error);
  }
}

/**
 * Initializes database and performs the expiration checks on startup:
 * 1. 7-day expiration check for individual image archive.
 * 2. 3-day expiration check for sessions.
 */
export async function initializeDatabase(): Promise<{ items: BatchItem[]; sessions: WorkSession[] }> {
  const lastActiveStr = localStorage.getItem('vanishai_last_active');
  const now = Date.now();

  if (lastActiveStr) {
    const lastActive = parseInt(lastActiveStr, 10);
    if (!isNaN(lastActive) && now - lastActive > ARCHIVE_EXPIRATION_MS) {
      console.log('No activity for over 7 days. Automatic self-cleaning archive.');
      await clearDatabase();
    }
  }

  // Set/update the last active timestamp
  localStorage.setItem('vanishai_last_active', now.toString());

  const items = await loadAllItems();
  const sessions = await loadAllSessions();

  return { items, sessions };
}
