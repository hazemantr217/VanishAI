import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import 'fake-indexeddb/auto';
import type { BatchItem } from '../types';

class NodeFileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  async readAsDataURL(blob: Blob) {
    try {
      const encoded = Buffer.from(await blob.arrayBuffer()).toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${encoded}`;
      this.onload?.({} as ProgressEvent<FileReader>);
    } catch (error) {
      this.error = error instanceof DOMException ? error : new DOMException('Unable to read blob');
      this.onerror?.({} as ProgressEvent<FileReader>);
    }
  }
}

Object.defineProperty(globalThis, 'FileReader', {
  configurable: true,
  value: NodeFileReader,
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: globalThis,
});

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('IndexedDB storage deduplicates image assets and restores sessions', async () => {
  const database = await import('./db');
  const item: BatchItem = {
    id: 'item-1',
    initialImage: tinyPng,
    originalImage: tinyPng,
    editHistory: [tinyPng],
    maskedImage: null,
    resultImage: tinyPng,
    status: 'completed',
    createdAt: Date.now(),
  };

  await database.saveAllItems([item]);
  const restoredItems = await database.loadAllItems();
  assert.equal(restoredItems.length, 1);
  assert.match(restoredItems[0].resultImage || '', /^blob:/);
  assert.equal((await fetch(restoredItems[0].resultImage!)).status, 200);

  await database.saveWorkSession({
    id: 'session-1',
    name: 'Test session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    itemCount: 1,
    completedCount: 1,
    previewThumbnails: [tinyPng],
    items: [item],
  });
  const sessions = await database.loadAllSessions();
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].items[0].originalImage, /^blob:/);

  const openRequest = indexedDB.open('VanishAIDatabase', 3);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error);
  });
  const assetCountRequest = db.transaction('assets', 'readonly').objectStore('assets').count();
  const assetCount = await new Promise<number>((resolve, reject) => {
    assetCountRequest.onsuccess = () => resolve(assetCountRequest.result);
    assetCountRequest.onerror = () => reject(assetCountRequest.error);
  });
  db.close();
  assert.equal(assetCount, 1);
});

test('rapid archive writes coalesce and persist the latest snapshot', async () => {
  const database = await import('./db');
  const first: BatchItem = {
    id: 'coalesced-item',
    initialImage: tinyPng,
    originalImage: tinyPng,
    editHistory: [],
    maskedImage: null,
    resultImage: null,
    status: 'pending',
    createdAt: Date.now(),
  };
  const latest = { ...first, status: 'completed' as const, resultImage: tinyPng };

  await Promise.all([
    database.saveAllItems([first]),
    database.saveAllItems([latest]),
    database.saveAllItems([latest]),
  ]);

  const restored = await database.loadAllItems();
  const coalesced = restored.find((item) => item.id === first.id);
  assert.equal(coalesced?.status, 'completed');
  assert.ok(coalesced?.resultImage);
});
