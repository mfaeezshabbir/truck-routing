import { useState } from 'react'
import { fetchHeatmap, fetchPlan } from './api'
import MapView, { type Metric } from './components/MapView'
import RouteCards from './components/RouteCards'
import TripForm from './components/TripForm'
import { RISK_COLORS, RISK_LABELS, fmtTime } from './risk'
import type { Heatmap, Plan, PlanRequest } from './types'

const METRICS: { id: Metric; label: string }[] = [
  { id: 'risk', label: 'Risk' }, { id: 'wind_mph', label: 'Wind' }, { id: 'rain_in_hr', label: 'Rain' }, { id: 'snow_in_hr', label: 'Snow' },
]

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

  const submit = async (req: PlanRequest) => {
    setLoading(true); setError(null); setHeatmap(null)
    try {
      const p = await fetchPlan(req)
      setPlan(p); setSelected(p.recommended_route_id); setHour(0)
      setHeatLoading(true)
      fetchHeatmap(p.plan_id).then(setHeatmap).catch(e => setError(`Heatmap: ${e.message}`)).finally(() => setHeatLoading(false))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 md:flex-row">
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4 md:w-[400px]">
        <header>
          <h1 className="text-lg font-bold text-slate-900">Weather-Aware Truck Routing</h1>
          <p className="text-xs text-slate-500">Compare route options by forecast weather at your ETA, load and travel time.</p>
        </header>
        <TripForm onSubmit={submit} loading={loading} />
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        {plan?.warning && <div className="rounded-lg border border-purple-200 bg-purple-50 p-2 text-sm text-purple-800">{plan.warning}</div>}
        {plan && (
          <>
            <div className="text-[11px] text-slate-400">Routing: {plan.provider} · {plan.routes.reduce((a, r) => a + r.checkpoints.length, 0)} checkpoints every {plan.interval_mi} mi</div>
            <RouteCards routes={plan.routes} selected={selected} onSelect={setSelected} />
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
        <MapView plan={plan} heatmap={heatmap} hour={hour} metric={metric} showHeatmap={showHeat} selected={selected} onSelectRoute={setSelected} />
        {plan && (
          <div className="absolute bottom-6 left-1/2 w-[min(640px,92%)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-1.5 font-medium text-slate-700">
                <input type="checkbox" checked={showHeat} onChange={e => setShowHeat(e.target.checked)} /> Corridor heatmap
              </label>
              <div className="flex gap-1">
                {METRICS.map(m => (
                  <button key={m.id} onClick={() => setMetric(m.id)}
                    className={`rounded-md px-2 py-0.5 ${metric === m.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{m.label}</button>
                ))}
              </div>
            </div>
            {heatmap ? (
              <>
                <input type="range" min={0} max={heatmap.hours.length - 1} value={hour} onChange={e => setHour(Number(e.target.value))} className="w-full accent-blue-600" />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Departure</span>
                  <span className="font-semibold text-slate-800">+{hour}h · {fmtTime(heatmap.hours[hour])}</span>
                  <span>+48h</span>
                </div>
              </>
            ) : <div className="text-xs text-slate-500">{heatLoading ? 'Loading 48h corridor forecast…' : 'Heatmap unavailable'}</div>}
          </div>
        )}
      </main>
    </div>
  )
}
