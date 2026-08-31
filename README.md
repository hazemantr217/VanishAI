# VanishAI

VanishAI is a full-stack React and Node.js image editor for precise object removal, masked edits, outpainting, high-fidelity recreation, and bounded-concurrency batch processing. Gemini and OpenAI calls run on the server; provider SDKs and managed secrets are never shipped in the browser bundle.

## Credential modes

The app selects the safest available mode at runtime:

| Environment | Behavior |
| --- | --- |
| Google AI Studio project | AI Studio injects that project's `GEMINI_API_KEY` as a server-side secret. The app never shows BYOK controls or accepts a browser key there. |
| Outside AI Studio without `GEMINI_API_KEY` | The app asks each user for a Gemini API key, verifies it, and keeps it only for the current browser session. |
| External managed deployment with `GEMINI_API_KEY` | The deployment uses the server-side key and does not ask users for one. |

BYOK keys are held in memory and `sessionStorage`, sent only to same-origin server routes, and never written to source code, the production bundle, `localStorage`, IndexedDB, or logs.

Important: a shared or Cloud Run-deployed AI Studio app uses the app owner's quota for all viewers. To use a different person's automatically managed AI Studio key, that person must copy/import the project into their own AI Studio account. This is a Google AI Studio platform rule, not something client code can override.

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
3. AI Studio supplies `GEMINI_API_KEY` to the Node.js server automatically.
4. Run the app. The runtime detects both AI Studio preview hosts and the managed secret, so the key dialog stays hidden even during a temporary config request failure.

OpenAI choices are deliberately hidden in this managed Google mode. Gemini uses the model's native output settings, matching the original AI Studio app; the UI does not send a `1K`/`2K`/`4K` override to Google models.

All Gemini calls remain under `server/providers/gemini.ts`. Do not move provider calls or secrets into `src/`. AI Studio uses its managed server-side `GEMINI_API_KEY`; standalone copies ask the user for a Gemini key when no managed server key exists.

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

`npm run check` runs the first four commands. Bundle verification fails if Gemini server SDK code or secret identifiers enter a browser asset. CI repeats these checks on every change to `main`.

## Architecture

- `src/components/CanvasWorkspace.tsx`: independent full-resolution mask layer, undo/redo, eraser, and worker-backed magic wand.
- `src/hooks/`: isolated runtime credentials, image processing, presets, persistence, and managed image-URL lifecycles.
- `src/services/api.ts`: same-origin API client and session-scoped BYOK handling.
- `src/lib/db.ts`: content-addressed Blob storage in IndexedDB with coalesced writes, deduplication, and bounded garbage collection.
- `server/api-router.ts`: validated API routes and sanitized errors.
- `server/providers/`: isolated Gemini and true OpenAI `images.edit` implementations.
- `src/shared/`: request and model contracts shared by browser and server.

Generated results are composited back only inside the selected mask in Vanish mode, preserving original pixels outside it.
