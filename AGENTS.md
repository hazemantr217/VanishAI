# VanishAI — Mandatory Architecture Contract

> [!CAUTION]
> **READ THIS FILE COMPLETELY BEFORE ANALYZING, EDITING, REFACTORING, OR “HARDENING” THIS REPOSITORY.**
>
> This is a repository-wide instruction file. The Google AI Studio Preview integration below is intentional, tested, and known to work. Do not replace it with a more conventional authentication or proxy design without reproducing the Stable behavior inside AI Studio first.

## 1. Known-good baseline

- Main repository: `hazemantr217/VanishAI`.
- Known-good main commit after the authentication repair: `4fc2a52d3d5e2f8b2708b9776c1832f0ecf086b8`.
- Read-only reference repository: `hazemantr217/VanishAI-stable`.
- Known Stable reference inspected during the repair: `da842cb979d5fe1572e45a687026ac8758e8fe35`.
- **Never commit, push, open a PR, or make any change in `VanishAI-stable`.** It is a comparison and recovery reference only.

If the current implementation stops generating images in Google AI Studio, compare it with both known-good commits before redesigning anything.

## 2. The working architecture — preserve it

VanishAI deliberately has two Gemini transports. They solve different deployment requirements and must not be collapsed into one path.

| Runtime | Gemini transport | Credential behavior | Key UI |
| --- | --- | --- | --- |
| Google AI Studio **Preview / development** | Direct browser call through `src/services/gemini-preview.ts` | Uses the AI Studio build-time `GEMINI_API_KEY`, matching Stable | Never show an API-key dialog or button |
| Published or external managed production | Same-origin backend, then `server/providers/gemini.ts` | Server-side `GEMINI_API_KEY` | No key UI when managed |
| Standalone app without a managed server key | Same-origin backend | User BYOK key held in memory/`sessionStorage` and sent in `X-Gemini-Api-Key` | Ask for a key |

This split is intentional. AI Studio Preview is the compatibility exception; production remains server-side.

### Preview request flow

1. `vite.config.ts` calls `loadEnv(mode, '.', '')`.
2. In non-production mode only, Vite defines `process.env.GEMINI_API_KEY` for the browser build.
3. `isGoogleAIStudioBrowser()` confirms that the app is inside an approved AI Studio host, referrer, or ancestor origin.
4. `canUseAIStudioPreviewGemini()` requires both the AI Studio context and a non-empty injected key.
5. `src/services/api.ts` calls `editWithAIStudioPreview()` or `mergeWithAIStudioPreview()` directly.
6. Outside that exact case, the existing backend route remains the fallback.

Do not change the fallback order. In particular, do not send AI Studio Preview Gemini generation through `/api/inpaint` or `/api/merge-batch` when the direct Preview connection is available.

## 3. Why Stable worked and the rebuilt version failed

Stable defaulted to a client-side Gemini connection inside AI Studio. During the rebuild, the default flow was moved behind a backend proxy and extra origin/authentication checks were added. That changed which credential and quota project Google saw.

The resulting failure chain was:

1. The frontend sometimes assumed a managed key existed even when runtime configuration failed.
2. Requests reached the backend without a usable key, producing `401`.
3. Additional Preview-origin or request-marker checks could reject AI Studio traffic with `403`.
4. When the backend did reach Gemini, it used the server/project quota instead of the working AI Studio Preview connection, producing `429` while Stable still generated normally.
5. An earlier image-memory change stored uploads as `blob:` URLs. Sending the URL string instead of converting it at the request boundary produced “unsupported image format”.

The successful repair restored Stable's direct Preview path while retaining the backend for production and standalone use.

## 4. Non-negotiable AI Studio invariants

### Authentication and UI

- Inside Google AI Studio, never show “Enter/Change Gemini API key”.
- Ignore and clear browser session keys inside AI Studio; they must not override the managed Preview connection.
- `GEMINI_API_KEY — No key selected` in AI Studio Secrets can be normal for Preview. Do not turn that state alone into a blocking dialog.
- A temporary `/api/runtime-config` failure must not make the app request a key inside AI Studio.
- Keep AI Studio host detection in `src/shared/ai-studio.ts` and its tests.
- Do not add custom origin, referrer, CSRF, or request-marker requirements to the direct Gemini Preview call.

### Gemini request shape

- Use `GoogleGenAI` and `models.generateContent`.
- Keep `User-Agent: aistudio-build` exactly.
- For an edit, send one processed/masked image plus one text prompt in one `contents: { parts: [...] }` object.
- Convert `blob:` image URLs to a real `data:image/...;base64,...` value only at the request boundary.
- Accept PNG, JPEG/JPG, and WebP.
- Do not send `imageSize` for Gemini from this app. `1K/2K/4K` controls are not part of the working Google path.
- Preserve `aspectRatio: 'original'` by omitting `imageConfig`; add only a validated aspect ratio when explicitly selected.
- Extract the generated image from `candidates[].content.parts[].inlineData`.
- Merge mode may send multiple images; ordinary edit/inpaint sends one image.

### Build boundary

- `vite.config.ts` must inject the Preview key only when `mode !== 'production'`.
- Production must define the browser-side Preview key as an empty string.
- Never commit a real API key, log it, expose it in errors, or store it in `localStorage`/IndexedDB.
- `npm run verify:bundle` must continue to reject a real-looking `AIzaSy...` credential in production assets.
- The presence of `@google/genai` in a browser chunk is intentional for AI Studio Preview; do not remove it merely because a generic security rule dislikes client SDKs.

This Preview tradeoff was explicitly selected to match the functioning Stable project. Any proposal to remove it must include a tested alternative that generates successfully in AI Studio without requesting a user key and without routing Preview traffic onto a failing backend quota.

### Batch parallelism

- The upload/workspace limit remains `MAX_BATCH_IMAGES = 100`.
- Reimagine batch processing intentionally starts every pending image in parallel. There is no fixed two-image concurrency cap.
- Do not reintroduce `maxBatchConcurrency` in server configuration, runtime configuration, or the client processor unless the owner explicitly requests a new limit.
- Per-image failures must remain isolated through `PromiseSettledResult`; one failed image must not cancel completed siblings.
- The recursive multi-image merge pipeline may keep its sequential chunk dependency. That is separate from ordinary image-batch parallelism.

## 5. Error signatures — diagnose before editing

| Symptom | Most likely regression | What to inspect first |
| --- | --- | --- |
| API-key dialog appears inside AI Studio | AI Studio detection or `runtimeRequiresUserApiKey` regressed | `src/shared/ai-studio.ts`, `src/hooks/useRuntimeCredentials.ts` |
| `401` from `/api/inpaint` | Preview incorrectly fell back to backend without a key | `canUseAIStudioPreviewGemini()`, Vite env injection, request path |
| `403` before provider logs | Preview traffic was blocked by origin/request-marker protection | `server/security.ts`, `server/api-router.ts`; confirm whether Preview should be using backend at all |
| `429` in backend logs while Stable works | Request used backend/server project quota instead of the direct Preview connection | Browser Network panel and `src/services/api.ts` routing |
| “Unsupported image format” | A `blob:` URL string was sent instead of image bytes/Base64 | `imageUrlToDataUrl()` at the request boundary |
| “Failed to load Gemini API key” plus Secrets=`No key selected` | AI Studio UI state; not sufficient proof that generation needs BYOK | Test the direct Preview connection and compare Stable |
| Vite WebSocket/HMR disconnected | Preview development connection issue, normally unrelated to Gemini generation | Treat separately; do not rewrite authentication |

Do not label every `429` as a user quota exhaustion. First establish whether the failing request came from the direct Preview path or from the backend. Preserve the provider status and request ID in diagnostics without exposing credentials.

## 6. Files that form the contract

- `vite.config.ts` — development-only Preview credential injection and separate Gemini bundle chunk.
- `src/services/gemini-preview.ts` — direct AI Studio Preview client and exact request envelope.
- `src/services/gemini-preview.test.ts` — Preview gating and request-shape regression tests.
- `src/services/api.ts` — routes Preview to the direct client before backend fallback.
- `src/shared/ai-studio.ts` and tests — trusted AI Studio environment detection.
- `src/hooks/useRuntimeCredentials.ts` and tests — suppresses BYOK inside AI Studio.
- `server/providers/gemini.ts` — production/standalone backend Gemini transport.
- `server/prompts.ts` — shared pure prompt builders; keep browser-imported code free of server runtime dependencies.
- `scripts/verify-client-bundle.mjs` — production credential-leak check.

Changes to any of these files require an explicit AI Studio regression review.

## 7. Mandatory workflow before every change

1. Read this file and the current `README.md` completely.
2. Check `git status`; preserve unrelated user changes.
3. Read the latest commits on remote `main` before building on a local checkout.
4. State whether the change touches the AI Studio contract files above.
5. If it touches authentication, routing, Vite env handling, image transport, Gemini request shape, runtime credentials, or security middleware:
   - compare the relevant behavior with `VanishAI-stable` read-only;
   - add or update a regression test;
   - verify that AI Studio never asks for a key;
   - verify that Preview uses the direct path and not `/api/inpaint`;
   - verify that production still contains no credential value.
6. Run the complete gate:

   ```bash
   npm ci
   npm run check
   ```

7. For a Preview-contract change, also build once in development mode with a fake test key and prove that the Preview route can see it. Then rebuild in production and prove the fake key is absent. Never use a real key for this test.
8. Review the final diff and confirm `VanishAI-stable` has no mutations.
9. Push without force and wait for GitHub Actions to pass.
10. In the handoff, provide the commit SHA, CI result, tests run, and exact AI Studio sync/restart steps.

No authentication or transport change is “done” based only on TypeScript, mocks, or a successful production build. It must preserve the behavior of the real AI Studio Preview environment.

## 8. Safe and unsafe refactors

Usually safe when covered by existing tests:

- UI layout, styling, accessibility, prompt-library wording, archive presentation, and isolated performance work.
- Backend production hardening that does not intercept or disable the direct Preview path.
- Pure extraction of shared prompt types/functions with no Node-only dependency entering the browser graph.

High-risk and requires explicit Preview verification:

- Moving all Gemini calls to the server.
- Removing `@google/genai` from the client bundle.
- Replacing `process.env.GEMINI_API_KEY` injection with runtime-config-only discovery.
- Treating Secrets=`No key selected` as missing credentials.
- Showing BYOK controls based on a failed runtime-config fetch.
- Adding mandatory custom headers or strict Origin checks to requests used by AI Studio Preview.
- Changing `generateContent` contents/parts structure, sending both original and masked images for normal edits, or adding `imageSize`.
- Passing managed `blob:` URLs beyond the client request boundary.
- Retrying provider `429` automatically across a batch; this can multiply quota failures.
- Reintroducing a fixed two-image batch concurrency limit or silently queuing ordinary Reimagine items.

## 9. Definition of done

A change is ready only when all applicable statements are true:

- Google AI Studio Preview generates an image successfully.
- It does not show or request an API key.
- The direct Preview request does not appear as a backend `/api/inpaint` provider call.
- Stable remains untouched and functional.
- Standalone BYOK and managed production fallback behavior remain intact.
- Gemini receives the expected image/prompt envelope with no `imageSize`.
- Blob/data URL conversion works for a real uploaded image.
- TypeScript, tests, architecture verification, production build, bundle verification, and GitHub Actions pass.

When in doubt, preserve the known-good architecture and make the smallest reversible change.
