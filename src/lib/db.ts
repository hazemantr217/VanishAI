import type { BatchItem } from '../types';

const DB_NAME = 'VanishAIDatabase';
const ITEMS_STORE = 'items';
const SESSIONS_STORE = 'sessions';
const ASSETS_STORE = 'assets';
const DB_VERSION = 3;

export const MAX_ARCHIVE_CAPACITY = 100;
export const MAX_SESSIONS_COUNT = 5;
export const SESSION_EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000;
export const ARCHIVE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

interface AssetReference {
  assetId: string;
}

type StoredImage = AssetReference | string | null | undefined;

interface StoredBatchItem extends Omit<BatchItem,
  | 'initialImage'
  | 'originalImage'
  | 'editHistory'
  | 'redoEditHistory'
  | 'maskedImage'
  | 'dalleMaskImage'
  | 'maskOverlayImage'
  | 'resultImage'
  | 'variants'
  | 'inputImages'
> {
  initialImage: StoredImage;
  originalImage: StoredImage;
  editHistory: StoredImage[];
  redoEditHistory?: StoredImage[];
  maskedImage: StoredImage;
  dalleMaskImage?: StoredImage;
  maskOverlayImage?: StoredImage;
  resultImage: StoredImage;
  variants?: StoredImage[];
  inputImages?: StoredImage[];
  archived: boolean;
  storedAt: number;
}

interface AssetRecord {
  id: string;
  blob: Blob;
  createdAt: number;
}

interface StoredWorkSession {
  id: string;
  name?: string;
  createdAt: number;
  updatedAt: number;
  itemIds: string[];
  items?: BatchItem[];
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

const isSupported = typeof window !== 'undefined' && 'indexedDB' in window;
const assetIdCache = new Map<string, string>();
const assetDataUrlCache = new Map<string, string>();
const MAX_MEMORY_CACHE_ENTRIES = 300;
let mutationQueue: Promise<void> = Promise.resolve();

function enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V) {
  if (cache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as K | undefined;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isSupported) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS_STORE)) {
        db.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => {
    if (!response.ok) throw new Error('Unable to decode image data.');
    return response.blob();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('Unable to decode stored image.'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function storeImageReference(
  image: string | null | undefined,
  pendingAssets: Map<string, AssetRecord>,
): Promise<StoredImage> {
  if (!image) return image;
  const cachedId = assetIdCache.get(image);
  if (cachedId) return { assetId: cachedId };

  const blob = await dataUrlToBlob(image);
  const assetId = await sha256(blob);
  remember(assetIdCache, image, assetId);
  pendingAssets.set(assetId, { id: assetId, blob, createdAt: Date.now() });
  return { assetId };
}

async function mapStoredImages(
  images: string[] | undefined,
  pendingAssets: Map<string, AssetRecord>,
): Promise<StoredImage[] | undefined> {
  if (!images) return undefined;
  const references: StoredImage[] = [];
  for (const image of images) references.push(await storeImageReference(image, pendingAssets));
  return references;
}

async function serializeItem(
  item: BatchItem,
  archived: boolean,
  pendingAssets: Map<string, AssetRecord>,
): Promise<StoredBatchItem> {
  return {
    ...item,
    initialImage: await storeImageReference(item.initialImage, pendingAssets),
    originalImage: await storeImageReference(item.originalImage, pendingAssets),
    editHistory: (await mapStoredImages(item.editHistory, pendingAssets)) || [],
    redoEditHistory: await mapStoredImages(item.redoEditHistory, pendingAssets),
    maskedImage: await storeImageReference(item.maskedImage, pendingAssets),
    dalleMaskImage: await storeImageReference(item.dalleMaskImage, pendingAssets),
    maskOverlayImage: await storeImageReference(item.maskOverlayImage, pendingAssets),
    resultImage: await storeImageReference(item.resultImage, pendingAssets),
    variants: await mapStoredImages(item.variants, pendingAssets),
    inputImages: await mapStoredImages(item.inputImages, pendingAssets),
    archived,
    storedAt: Date.now(),
  };
}

async function resolveStoredImage(
  value: StoredImage,
  assets: Map<string, Blob>,
): Promise<string | null | undefined> {
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  const cached = assetDataUrlCache.get(value.assetId);
  if (cached) return cached;
  const blob = assets.get(value.assetId);
  if (!blob) return null;
  const dataUrl = await blobToDataUrl(blob);
  remember(assetDataUrlCache, value.assetId, dataUrl);
  return dataUrl;
}

async function resolveStoredImages(
  values: StoredImage[] | undefined,
  assets: Map<string, Blob>,
): Promise<string[] | undefined> {
  if (!values) return undefined;
  const resolved: string[] = [];
  for (const value of values) {
    const image = await resolveStoredImage(value, assets);
    if (image) resolved.push(image);
  }
  return resolved;
}

async function inflateItem(record: StoredBatchItem, assets: Map<string, Blob>): Promise<BatchItem | null> {
  const initialImage = await resolveStoredImage(record.initialImage, assets);
  const originalImage = await resolveStoredImage(record.originalImage, assets);
  if (!initialImage || !originalImage) return null;

  return {
    ...record,
    initialImage,
    originalImage,
    editHistory: (await resolveStoredImages(record.editHistory, assets)) || [],
    redoEditHistory: await resolveStoredImages(record.redoEditHistory, assets),
    maskedImage: (await resolveStoredImage(record.maskedImage, assets)) || null,
    dalleMaskImage: await resolveStoredImage(record.dalleMaskImage, assets),
    maskOverlayImage: await resolveStoredImage(record.maskOverlayImage, assets),
    resultImage: (await resolveStoredImage(record.resultImage, assets)) || null,
    variants: await resolveStoredImages(record.variants, assets),
    inputImages: await resolveStoredImages(record.inputImages, assets),
  };
}

async function readStoredState(): Promise<{
  items: StoredBatchItem[];
  sessions: StoredWorkSession[];
  assets: Map<string, Blob>;
}> {
  const db = await openDB();
  const transaction = db.transaction([ITEMS_STORE, SESSIONS_STORE, ASSETS_STORE], 'readonly');
  const done = transactionDone(transaction);
  const [items, sessions, assetRecords] = await Promise.all([
    requestToPromise(transaction.objectStore(ITEMS_STORE).getAll()) as Promise<StoredBatchItem[]>,
    requestToPromise(transaction.objectStore(SESSIONS_STORE).getAll()) as Promise<StoredWorkSession[]>,
    requestToPromise(transaction.objectStore(ASSETS_STORE).getAll()) as Promise<AssetRecord[]>,
  ]);
  await done;
  return {
    items,
    sessions,
    assets: new Map(assetRecords.map((asset) => [asset.id, asset.blob])),
  };
}

async function archivedFlagsFor(ids: string[]): Promise<Map<string, boolean>> {
  if (ids.length === 0) return new Map();
  const db = await openDB();
  const transaction = db.transaction(ITEMS_STORE, 'readonly');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(ITEMS_STORE);
  const records = await Promise.all(ids.map((id) => requestToPromise(store.get(id)) as Promise<StoredBatchItem | undefined>));
  await done;
  return new Map(records.filter(Boolean).map((record) => [record!.id, Boolean(record!.archived)]));
}

async function persistItems(items: BatchItem[], markAsArchived?: boolean): Promise<void> {
  if (!isSupported || items.length === 0) return;
  const archivedFlags = markAsArchived === undefined
    ? await archivedFlagsFor(items.map((item) => item.id))
    : new Map<string, boolean>();
  const pendingAssets = new Map<string, AssetRecord>();
  const records: StoredBatchItem[] = [];
  for (const item of items) {
    const archived = markAsArchived ?? archivedFlags.get(item.id) ?? false;
    records.push(await serializeItem(item, archived, pendingAssets));
  }

  const db = await openDB();
  const transaction = db.transaction([ITEMS_STORE, ASSETS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const itemStore = transaction.objectStore(ITEMS_STORE);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  pendingAssets.forEach((asset) => assetStore.put(asset));
  records.forEach((record) => itemStore.put(record));
  await done;
}

function collectAssetIds(value: unknown, output: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAssetIds(entry, output));
    return;
  }
  if (typeof value === 'object' && 'assetId' in value) {
    output.add((value as AssetReference).assetId);
  }
}

function sessionItemIdsFor(session: StoredWorkSession): string[] {
  if (Array.isArray(session.itemIds)) return session.itemIds;
  return Array.isArray(session.items) ? session.items.map((item) => item.id) : [];
}

async function garbageCollect(): Promise<void> {
  if (!isSupported) return;
  const { items, sessions, assets } = await readStoredState();
  const sessionItemIds = new Set(sessions.flatMap(sessionItemIdsFor));
  const retainedItems = items.filter((item) => item.archived !== false || sessionItemIds.has(item.id));
  const retainedItemIds = new Set(retainedItems.map((item) => item.id));
  const retainedAssetIds = new Set<string>();
  retainedItems.forEach((item) => {
    collectAssetIds(item.initialImage, retainedAssetIds);
    collectAssetIds(item.originalImage, retainedAssetIds);
    collectAssetIds(item.editHistory, retainedAssetIds);
    collectAssetIds(item.redoEditHistory, retainedAssetIds);
    collectAssetIds(item.maskedImage, retainedAssetIds);
    collectAssetIds(item.dalleMaskImage, retainedAssetIds);
    collectAssetIds(item.maskOverlayImage, retainedAssetIds);
    collectAssetIds(item.resultImage, retainedAssetIds);
    collectAssetIds(item.variants, retainedAssetIds);
    collectAssetIds(item.inputImages, retainedAssetIds);
  });

  const db = await openDB();
  const transaction = db.transaction([ITEMS_STORE, ASSETS_STORE], 'readwrite');
  const done = transactionDone(transaction);
  const itemStore = transaction.objectStore(ITEMS_STORE);
  const assetStore = transaction.objectStore(ASSETS_STORE);
  items.forEach((item) => {
    if (!retainedItemIds.has(item.id)) itemStore.delete(item.id);
  });
  assets.forEach((_blob, id) => {
    if (!retainedAssetIds.has(id)) assetStore.delete(id);
  });
  await done;
  assetIdCache.clear();
  assetDataUrlCache.clear();
}

async function clearDatabaseNow(): Promise<void> {
  if (!isSupported) return;
  const db = await openDB();
  const transaction = db.transaction(ITEMS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(ITEMS_STORE);
  const records = await requestToPromise(store.getAll()) as StoredBatchItem[];
  records.forEach((record) => store.put({ ...record, archived: false }));
  await done;
  await garbageCollect();
}

export async function loadAllItems(): Promise<BatchItem[]> {
  if (!isSupported) return [];
  const { items, assets } = await readStoredState();
  const now = Date.now();
  const activeRecords = items
    .filter((item) => item.archived !== false && now - (item.createdAt || item.storedAt || now) <= ARCHIVE_EXPIRATION_MS)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, MAX_ARCHIVE_CAPACITY);

  const expiredIds = new Set(
    items
      .filter((item) => item.archived !== false && !activeRecords.some((active) => active.id === item.id))
      .map((item) => item.id),
  );
  if (expiredIds.size > 0) {
    const db = await openDB();
    const transaction = db.transaction(ITEMS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ITEMS_STORE);
    items.forEach((item) => {
      if (expiredIds.has(item.id)) store.put({ ...item, archived: false });
    });
    await done;
  }

  const inflated = await Promise.all(activeRecords.map((record) => inflateItem(record, assets)));
  return inflated.filter((item): item is BatchItem => Boolean(item));
}

async function saveAllItemsNow(items: BatchItem[]): Promise<void> {
  if (!isSupported) return;
  const itemsToSave = items.slice(0, MAX_ARCHIVE_CAPACITY);
  const existing = (await readStoredState()).items;
  const activeIds = new Set(itemsToSave.map((item) => item.id));

  await persistItems(itemsToSave, true);

  const db = await openDB();
  const transaction = db.transaction(ITEMS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(ITEMS_STORE);
  existing.forEach((record) => {
    if (record.archived !== false && !activeIds.has(record.id)) store.put({ ...record, archived: false });
  });
  await done;
  await garbageCollect();
}

export async function loadAllSessions(): Promise<WorkSession[]> {
  if (!isSupported) return [];
  const state = await readStoredState();
  const now = Date.now();
  const validSessions = state.sessions
    .filter((session) => now - (session.updatedAt || session.createdAt || 0) <= SESSION_EXPIRATION_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS_COUNT);
  const validIds = new Set(validSessions.map((session) => session.id));

  if (validSessions.length !== state.sessions.length) {
    const db = await openDB();
    const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore(SESSIONS_STORE);
    state.sessions.forEach((session) => {
      if (!validIds.has(session.id)) store.delete(session.id);
    });
    await done;
  }

  const recordsById = new Map(state.items.map((item) => [item.id, item]));
  const inflatedById = new Map<string, BatchItem>();
  validSessions.forEach((session) => {
    session.items?.forEach((item) => inflatedById.set(item.id, item));
  });
  const neededIds = new Set(validSessions.flatMap(sessionItemIdsFor));
  await Promise.all(Array.from(neededIds, async (id) => {
    const record = recordsById.get(id);
    if (!record || inflatedById.has(id)) return;
    const item = await inflateItem(record, state.assets);
    if (item) inflatedById.set(id, item);
  }));

  return validSessions.map((session) => {
    const items = sessionItemIdsFor(session).map((id) => inflatedById.get(id)).filter((item): item is BatchItem => Boolean(item));
    return {
      id: session.id,
      name: session.name,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      itemCount: items.length,
      completedCount: items.filter((item) => item.status === 'completed').length,
      previewThumbnails: items.slice(0, 4).map((item) => item.resultImage || item.originalImage),
      items,
    };
  }).filter((session) => session.items.length > 0);
}

async function saveWorkSessionNow(session: WorkSession): Promise<void> {
  if (!isSupported || session.items.length === 0) return;
  await persistItems(session.items);

  const existing = (await readStoredState()).sessions
    .filter((stored) => stored.id !== session.id)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const record: StoredWorkSession = {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    updatedAt: Date.now(),
    itemIds: session.items.map((item) => item.id),
  };
  const retained = [record, ...existing].slice(0, MAX_SESSIONS_COUNT);
  const retainedIds = new Set(retained.map((stored) => stored.id));

  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(SESSIONS_STORE);
  existing.forEach((stored) => {
    if (!retainedIds.has(stored.id)) store.delete(stored.id);
  });
  retained.forEach((stored) => store.put(stored));
  await done;
}

async function deleteWorkSessionNow(sessionId: string): Promise<void> {
  if (!isSupported) return;
  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(SESSIONS_STORE).delete(sessionId);
  await done;
  await garbageCollect();
}

async function clearAllWorkSessionsNow(): Promise<void> {
  if (!isSupported) return;
  const db = await openDB();
  const transaction = db.transaction(SESSIONS_STORE, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(SESSIONS_STORE).clear();
  await done;
  await garbageCollect();
}

export function clearDatabase(): Promise<void> {
  return enqueueMutation(clearDatabaseNow);
}

export function saveAllItems(items: BatchItem[]): Promise<void> {
  return enqueueMutation(() => saveAllItemsNow(items));
}

export function saveWorkSession(session: WorkSession): Promise<void> {
  return enqueueMutation(() => saveWorkSessionNow(session));
}

export function deleteWorkSession(sessionId: string): Promise<void> {
  return enqueueMutation(() => deleteWorkSessionNow(sessionId));
}

export function clearAllWorkSessions(): Promise<void> {
  return enqueueMutation(clearAllWorkSessionsNow);
}

export async function initializeDatabase(): Promise<{ items: BatchItem[]; sessions: WorkSession[] }> {
  if (!isSupported) return { items: [], sessions: [] };
  const [items, sessions] = await Promise.all([loadAllItems(), loadAllSessions()]);
  await enqueueMutation(garbageCollect);
  return { items, sessions };
}
