import { Suspense, lazy, useRef, useState } from 'react'
import { fetchHeatmap, fetchPlan } from './api'
import CheckpointList from './components/CheckpointList'
import RouteCards from './components/RouteCards'
import TripForm from './components/TripForm'
import { METRICS, type Metric } from './metrics'
import { RISK_COLORS, RISK_LABELS, fmtTime } from './risk'
import type { Focus, Heatmap, Plan, PlanRequest } from './types'

// MapLibre is ~1 MB: split it into its own chunk so the form/sidebar paint immediately.
const MapView = lazy(() => import('./components/MapView'))

const METRIC_IDS = Object.keys(METRICS) as Metric[]

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [heatmap, setHeatmap] = useState<Heatmap | null>(null)
  const [loading, setLoading] = useState(false)
  const [heatLoading, setHeatLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [hour, setHour] = useState(0)
  const [metric, setMetric] = useState<Metric>('risk')
  const [showHeat, setShowHeat] = useState(true)
  const [focus, setFocus] = useState<Focus | null>(null)

  // Monotonic request id: responses of a superseded submit are ignored (no stale plan/heatmap).
  const reqId = useRef(0)

  const submit = async (req: PlanRequest) => {
    const id = ++reqId.current
    setLoading(true); setError(null); setHeatmap(null); setHeatLoading(false); setFocus(null)
    try {
      const p = await fetchPlan(req)
      if (id !== reqId.current) return
      setPlan(p); setSelected(p.recommended_route_id ?? p.routes[0]?.id ?? null); setHour(0)
      setHeatLoading(true)
      fetchHeatmap(p.plan_id)
        .then(h => { if (id === reqId.current) setHeatmap(h) })
        .catch(e => { if (id === reqId.current) setError(`Heatmap: ${e.message}`) })
        .finally(() => { if (id === reqId.current) setHeatLoading(false) })
    } catch (e) {
      if (id === reqId.current) { setPlan(null); setError((e as Error).message) }
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }
  const lastHour = heatmap ? heatmap.hours.length - 1 : 48
  const selectedRoute = plan?.routes.find(r => r.id === selected)
  const selectRoute = (id: number) => { setSelected(id); if (focus && focus.route !== id) setFocus(null) }

  return (
    <div className="flex h-full flex-col bg-slate-50 md:flex-row">
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4 md:w-[400px]">
        <header>
          <h1 className="text-lg font-bold text-slate-900">Weather-Aware Truck Routing</h1>
          <p className="text-xs text-slate-500">Compare route options by forecast weather at your ETA, load and travel time.</p>
        </header>
        <TripForm onSubmit={submit} loading={loading} />
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        {plan?.warning && <div className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-sm text-purple-800">{plan.warning}</div>}
        {plan && (
          <>
            <div className="text-[11px] text-slate-400">Routing: {plan.provider} · {plan.routes.reduce((a, r) => a + r.checkpoints.length, 0)} checkpoints every {plan.interval_mi} mi</div>
            <RouteCards routes={plan.routes} selected={selected} onSelect={selectRoute} />
            {selectedRoute && <CheckpointList route={selectedRoute} focus={focus} onFocus={setFocus} />}
          </>
        )}
        <div className="mt-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
          <div className="mb-1 flex flex-wrap gap-2">
            {RISK_LABELS.map((l, i) => <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[i] }} />{l}</span>)}
          </div>
          Ranking: No Travel last → fewest Severe miles → fewest High miles → lowest avg risk → shortest time.
        </div>
      </aside>
      <main className="relative min-h-[420px] flex-1">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>}>
          <MapView plan={plan} heatmap={heatmap} hour={Math.min(hour, lastHour)} metric={metric} showHeatmap={showHeat} selected={selected} onSelectRoute={selectRoute} focus={focus} onFocus={setFocus} />
        </Suspense>
        {plan && (
          <div className="absolute bottom-6 left-1/2 w-[min(640px,92%)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                <input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Corridor heatmap
              </label>
              <div className="flex gap-1" role="group" aria-label="Heatmap metric">
                {METRIC_IDS.map(id => (
                  <button type="button" key={id} onClick={() => setMetric(id)} aria-pressed={metric === id}
                    className={`rounded-md px-2 py-0.5 ${metric === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{METRICS[id].label}</button>
                ))}
              </div>
            </div>
            {heatmap ? (
              <>
                <input type="range" aria-label="Forecast hour after departure" aria-valuetext={`+${hour} hours, ${fmtTime(heatmap.hours[Math.min(hour, lastHour)])}`}
                  min={0} max={lastHour} value={Math.min(hour, lastHour)} onChange={e => setHour(Number(e.target.value))} className="w-full accent-blue-600" />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Departure</span>
                  <span className="font-semibold text-slate-800" aria-live="polite">+{Math.min(hour, lastHour)}h · {fmtTime(heatmap.hours[Math.min(hour, lastHour)])}</span>
                  <span>+{lastHour}h</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500" aria-label="Heatmap legend">
                  <span className="font-medium text-slate-600">{METRICS[metric].label} ({METRICS[metric].unit}):</span>
                  {METRICS[metric].legend.map((l, i) => (
                    <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: RISK_COLORS[i] }} />{l}</span>
                  ))}
                </div>
              </>
            ) : <div className="text-xs text-slate-500">{heatLoading ? 'Loading 48h corridor forecast…' : 'Heatmap unavailable'}</div>}
          </div>
        )}
      </main>
    </div>
  )
}
