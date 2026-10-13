import type { Heatmap, Plan, PlanRequest } from './types'
import { fetchWeather, type WeatherRequest } from './weather'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

async function handle<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = body.error ?? Object.entries(body).map(([k, v]) => `${k}: ${v}`).join('; ')
    throw new Error(msg || `Request failed (${r.status})`)
  }
  return body as T
}

const post = <T>(path: string, body: unknown) =>
  fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => handle<T>(r))

type Prepared = { plan_id: string; weather: WeatherRequest }

/** Routes and ETAs from the backend, forecasts from the browser, scoring back on the backend. */
export async function fetchPlan(req: PlanRequest): Promise<Plan> {
  const prep = await post<Prepared>('/api/plan/prepare', req)
  const weather = await fetchWeather(prep.weather)
  return post<Plan>('/api/plan/score', { plan_id: prep.plan_id, weather })
}

// The heatmap only shows wind, rain and snow, so the other variables are not uploaded.
const HEAT_VARS = ['wind_speed_10m', 'rain', 'showers', 'snowfall']

export async function fetchHeatmap(planId: string): Promise<Heatmap> {
  const prep = await fetch(`${BASE}/api/heatmap/request?plan_id=${planId}`).then(r => handle<Prepared>(r))
  const weather = await fetchWeather(prep.weather, HEAT_VARS)
  return post<Heatmap>('/api/heatmap', { plan_id: planId, weather })
}
