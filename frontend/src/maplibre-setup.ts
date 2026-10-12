// Vite pre-bundles maplibre-gl into node_modules/.vite/deps, which breaks the library's default
// `new URL('maplibre-gl-worker.mjs', import.meta.url)` worker lookup (404 in dev).
// Point it at the real worker file explicitly; `?url` makes Vite serve it in dev and emit it as a
// hashed asset in production builds. The worker bundle is self-contained (no relative imports).
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(workerUrl)
