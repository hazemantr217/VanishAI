import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../server';

const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XzSQSQAAAABJRU5ErkJggg==';
const AI_STUDIO_HOST = 'ais-dev-eve4jfbsmnjwvhnnyfudxb-20643648940.europe-west2.run.app';

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
    assert.equal(config.googleOnlyMode, false);
    assert.equal(config.openaiAvailable, false);
    assert.equal(typeof config.maxBatchConcurrency, 'number');
    assert.equal(JSON.stringify(config).includes('API_KEY'), false);
  });
});

test('AI Studio runtime is always managed and never advertises BYOK', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/runtime-config`, {
      headers: { 'x-forwarded-host': AI_STUDIO_HOST },
    });
    assert.equal(response.status, 200);
    const config = await response.json() as Record<string, unknown>;
    assert.equal(config.geminiCredentialMode, 'managed');
    assert.equal(config.googleOnlyMode, true);
    assert.equal(config.openaiAvailable, false);
  });
});

test('AI Studio never falls back to a browser key when its managed connection is absent', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-host': AI_STUDIO_HOST,
        'x-gemini-api-key': 'stale-browser-key',
      },
      body: JSON.stringify({
        maskedImage: TEST_IMAGE,
        prompt: '',
        model: 'gemini-3.1-flash-lite-image',
        appMode: 'reimagine',
        aspectRatio: 'original',
        imageSize: '1K',
        similarityLevel: 'high',
      }),
    });

    assert.equal(response.status, 503);
    const payload = await response.json() as { code: string; error: string };
    assert.equal(payload.code, 'MANAGED_GEMINI_UNAVAILABLE');
    assert.doesNotMatch(payload.error, /أدخل مفتاح/);
  });
});

test('multipart API routes reject cross-origin requests', async () => {
  await withTestServer(async (baseUrl) => {
    const formData = new FormData();
    formData.set('metadata', '{}');
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'x-vanish-request': '1',
      },
      body: formData,
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, 'CROSS_ORIGIN_REQUEST');
  });
});

test('AI Studio forwarded preview host passes the same-origin guard', async () => {
  await withTestServer(async (baseUrl) => {
    const formData = new FormData();
    formData.set('metadata', '{}');
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        origin: 'https://preview.example',
        'x-forwarded-host': 'preview.example',
        'x-vanish-request': '1',
      },
      body: formData,
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('legacy AI Studio JSON transport does not require a custom request marker', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('legacy JSON transport still rejects cross-origin browser requests', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site',
      },
      body: '{}',
    });

    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, 'CROSS_SITE_REQUEST');
  });
});

test('Google AI Studio preview JSON passes the origin guard through its proxy', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://preview-session-123.scf.usercontent.goog',
        'sec-fetch-site': 'cross-site',
      },
      body: '{}',
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('Google AI Studio Cloud Run preview passes the cross-site proxy guard', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://ais-dev-eve4jfbsmnjwvhnnyfudxb-20643648940.europe-west2.run.app',
        'sec-fetch-site': 'cross-site',
      },
      body: '{}',
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('inpaint validates payloads before calling a provider', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vanish-request': '1' },
      body: JSON.stringify({ model: 'gemini-3.1-flash-image' }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code: string }).code, 'INVALID_REQUEST');
  });
});

test('multipart uploads enforce the selected model resolution', async () => {
  await withTestServer(async (baseUrl) => {
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XzSQSQAAAABJRU5ErkJggg==', 'base64');
    const formData = new FormData();
    formData.set('metadata', JSON.stringify({
      prompt: '',
      model: 'gemini-3.1-flash-lite-image',
      appMode: 'reimagine',
      aspectRatio: 'original',
      imageSize: '2K',
    }));
    formData.set('originalImage', new Blob([tinyPng], { type: 'image/png' }), 'original.png');
    formData.set('maskedImage', new Blob([tinyPng], { type: 'image/png' }), 'masked.png');

    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'x-vanish-request': '1' },
      body: formData,
    });

    assert.equal(response.status, 400);
    const payload = await response.json() as { code: string; error: string };
    assert.equal(payload.code, 'INVALID_REQUEST');
    assert.match(payload.error, /1K/);
  });
});

test('malformed JSON returns a sanitized JSON error', async () => {
  await withTestServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/inpaint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-vanish-request': '1' },
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
