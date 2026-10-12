import type { Heatmap, Plan, PlanRequest } from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

async function handle<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = body.error ?? Object.entries(body).map(([k, v]) => `${k}: ${v}`).join('; ')
    throw new Error(msg || `Request failed (${r.status})`)
  }
  return body as T
}

export const fetchPlan = (req: PlanRequest) =>
  fetch(`${BASE}/api/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
  }).then(r => handle<Plan>(r))

export const fetchHeatmap = (planId: string) =>
  fetch(`${BASE}/api/heatmap?plan_id=${planId}`).then(r => handle<Heatmap>(r))
