// Vite's pre-bundling breaks maplibre-gl's default worker URL (404 in dev), so point at the worker file directly.
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(workerUrl)
