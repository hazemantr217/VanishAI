import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../server';

async function withTestServer(run: (baseUrl: string) => Promise<void>) {
  const app = await createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('health and runtime config expose no credentials', async () => {
  await withTestServer(async (baseUrl) => {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { status: 'ok' });

    const configResponse = await fetch(`${baseUrl}/api/runtime-config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json() as Record<string, unknown>;
    assert.equal(config.geminiCredentialMode, 'byok');
    assert.equal(config.openaiAvailable, false);
    assert.equal(typeof config.maxBatchConcurrency, 'number');
    assert.equal(JSON.stringify(config).includes('API_KEY'), false);
  });
});

test('mutating API routes reject cross-origin requests', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      body: '{}',
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, 'CROSS_ORIGIN_REQUEST');
  });
});

test('inpaint validates payloads before calling a provider', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.1-flash-image' }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('malformed JSON returns a sanitized JSON error', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type') || '', /^application\/json/);
    const payload = await response.json() as { code: string; requestId: string };
    assert.equal(payload.code, 'INVALID_JSON');
    assert.ok(payload.requestId);
  });
});

test('unknown API routes return JSON instead of the SPA', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/not-a-route`);
    assert.equal(response.status, 404);
    assert.equal((await response.json() as { code: string }).code, 'API_ROUTE_NOT_FOUND');
  });
});
