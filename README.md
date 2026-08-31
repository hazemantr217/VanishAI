# VanishAI

> [!IMPORTANT]
> **Before making any change, read [`AGENTS.md`](./AGENTS.md) completely.** It records the known-good Google AI Studio architecture, the failures that previously caused `401/403/429`, and the mandatory regression checks. Do not refactor Gemini authentication or transport before understanding that contract.

VanishAI is a full-stack React and Node.js image editor for precise object removal, masked edits, outpainting, high-fidelity recreation, and bounded-concurrency batch processing. Google AI Studio Preview intentionally uses a Stable-compatible direct browser Gemini path; published/standalone deployments use the backend provider path.

## Credential modes

The app selects the safest available mode at runtime:

| Environment | Behavior |
| --- | --- |
| Google AI Studio Preview | Matches the original Stable app by using AI Studio's build-time default connection without showing BYOK controls. |
| Published/external managed app | Uses the server-side `GEMINI_API_KEY` and never exposes it in a production bundle. |
| Outside AI Studio without `GEMINI_API_KEY` | The app asks each user for a Gemini API key, verifies it, and keeps it only for the current browser session. |
| External managed deployment with `GEMINI_API_KEY` | The deployment uses the server-side key and does not ask users for one. |

BYOK keys are held in memory and `sessionStorage`, sent only to same-origin server routes, and never written to source code, the production bundle, `localStorage`, IndexedDB, or logs.

Important: the legacy Preview compatibility path matches the working Stable repository and is limited to non-production AI Studio builds. Published and external builds continue through the server. A shared or Cloud Run-deployed app uses the app owner's quota for all viewers.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm ci
npm run dev
```

Leave `GEMINI_API_KEY` unset for the default per-user BYOK flow. To test a managed deployment, copy `.env.example` to `.env` and set a server-side `GEMINI_API_KEY`. `OPENAI_API_KEY` is optional and enables the OpenAI model choices.

## Google AI Studio

1. Open Build mode in Google AI Studio.
2. Choose **Import from GitHub** and select this repository.
3. AI Studio Preview supplies its default build-time Gemini connection, matching the Stable app even when the Secrets panel says `No key selected`.
4. Run the app. No key dialog is shown. Production publishing still requires the server-side managed connection.

OpenAI choices are deliberately hidden in this managed Google mode. Gemini uses the model's native output settings, matching the original AI Studio app; the UI does not send a `1K`/`2K`/`4K` override to Google models.

The two Gemini transports are intentional: `src/services/gemini-preview.ts` is the development-only AI Studio Preview compatibility path, while `server/providers/gemini.ts` serves production and standalone deployments. Do not collapse them into a single backend path; doing so previously made Preview use the wrong project/quota and return `401/403/429`. See [`AGENTS.md`](./AGENTS.md) before changing either path.

## Production

```bash
npm ci
npm run check
NODE_ENV=production PORT=8080 npm start
```

The included multi-stage `Dockerfile` builds a non-root production image suitable for Cloud Run. The server honors `PORT`, exposes `/api/health`, validates request bodies, uploads images as binary multipart data, rate-limits APIs, rejects cross-origin mutations, propagates client cancellation to providers, and returns sanitized errors with request IDs.

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Managed Gemini mode; empty enables BYOK. |
| `OPENAI_API_KEY` | empty | Enables server-side OpenAI image edits. |
| `PORT` | `3000` | HTTP port; Cloud Run normally injects `8080`. |
| `REDIS_URL` | empty | Optional shared rate-limit store for multi-container deployments; single-instance AI Studio needs no extra setting. |

## Quality and safety checks

```bash
npm run typecheck
npm test
npm run build
npm run verify:bundle
npm audit
```

`npm run check` runs the first four commands. Bundle verification fails if a real-looking Gemini credential enters a production browser asset. The browser SDK itself is intentional in the AI Studio Preview compatibility chunk. CI repeats these checks on every change to `main`.

## Architecture

- `src/components/CanvasWorkspace.tsx`: independent full-resolution mask layer, undo/redo, eraser, and worker-backed magic wand.
- `src/hooks/`: isolated runtime credentials, image processing, presets, persistence, and managed image-URL lifecycles.
- `src/services/gemini-preview.ts`: direct Gemini transport used only by Google AI Studio Preview/development.
- `src/services/api.ts`: selects the direct Preview transport first, otherwise uses the same-origin API and session-scoped BYOK handling.
- `src/lib/db.ts`: content-addressed Blob storage in IndexedDB with coalesced writes, deduplication, and bounded garbage collection.
- `server/api-router.ts`: validated API routes and sanitized errors.
- `server/providers/`: production/standalone Gemini and true OpenAI `images.edit` implementations.
- `src/shared/`: request and model contracts shared by browser and server.

Generated results are composited back only inside the selected mask in Vanish mode, preserving original pixels outside it.
