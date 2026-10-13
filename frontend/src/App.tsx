import { Suspense, lazy, useRef, useState } from 'react'
import { Loader2, Truck } from 'lucide-react'
import { fetchHeatmap, fetchPlan } from './api'
import CheckpointList from './components/CheckpointList'
import RouteCards, { Recommendation } from './components/RouteCards'
import TimelinePanel from './components/TimelinePanel'
import TripForm from './components/TripForm'
import type { Metric } from './metrics'
import { RISK_COLORS, RISK_LABELS } from './risk'
import type { Focus, Heatmap, Plan, PlanRequest } from './types'

// MapLibre is ~1 MB, so it loads in its own chunk after the sidebar.
const MapView = lazy(() => import('./components/MapView'))

type Tab = 'routes' | 'checkpoints'

function MapLegend() {
  return (
    <div className="pointer-events-auto rounded-md border border-slate-300 bg-white px-2.5 py-2 text-[11px] text-slate-600">
      <div className="mb-1 font-medium text-slate-800">Checkpoint risk</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {RISK_LABELS.map((l, i) => (
          <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[i] }} />{l}</span>
        ))}
      </div>
      <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-white" />Break or rest stop</span>
        <span className="flex items-center gap-1.5"><Truck size={12} className="text-slate-700" />Truck at slider time</span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="pointer-events-auto max-w-xs rounded-md border border-slate-300 bg-white p-4 text-sm text-slate-600">
      <div className="mb-1 font-semibold text-slate-900">No trip yet</div>
      Enter a trip on the left. You'll get up to 3 truck routes, with the weather checked for when the truck
      reaches each point.
    </div>
  )
}

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
  const [tab, setTab] = useState<Tab>('routes')
  const [editing, setEditing] = useState(true)

  // Ignore responses from a submit that has since been replaced.
  const reqId = useRef(0)

  const submit = async (req: PlanRequest) => {
    const id = ++reqId.current
    setLoading(true); setError(null); setHeatmap(null); setHeatLoading(false); setFocus(null)
    try {
      const p = await fetchPlan(req)
      if (id !== reqId.current) return
      setPlan(p); setSelected(p.recommended_route_id ?? p.routes[0]?.id ?? null); setHour(0)
      setEditing(false); setTab('routes')
      setHeatLoading(true)
      fetchHeatmap(p.plan_id)
        .then(h => { if (id === reqId.current) setHeatmap(h) })
        .catch(e => { if (id === reqId.current) setError(`Weather layer: ${e.message}`) })
        .finally(() => { if (id === reqId.current) setHeatLoading(false) })
    } catch (e) {
      if (id === reqId.current) { setPlan(null); setError((e as Error).message) }
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }
  const lastHour = heatmap ? heatmap.hours.length - 1 : 0
  const shownHour = Math.min(hour, lastHour)
  const selectedRoute = plan?.routes.find(r => r.id === selected)
  const selectRoute = (id: number) => { setSelected(id); if (focus && focus.route !== id) setFocus(null) }
  const focusCheckpoint = (f: Focus | null) => { setFocus(f); if (f) { setSelected(f.route); setTab('checkpoints') } }

  const tabClass = (t: Tab) => `-mb-px border-b-2 px-0.5 pb-2 text-sm ${tab === t ? 'border-ink font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`

  return (
    <div className="flex h-full flex-col bg-slate-100 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-r border-slate-200 bg-white md:h-full md:w-105">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3.5">
          <Truck size={20} className="text-ink" />
          <h1 className="text-base font-semibold text-slate-900">Truck Routing</h1>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <TripForm onSubmit={submit} loading={loading} collapsed={!!plan && !editing && !loading} onExpand={() => setEditing(true)} />
          {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>}

          {plan && !loading && (
            <>
              <Recommendation plan={plan} />
              <div className="flex gap-4 border-b border-slate-200" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'routes'} className={tabClass('routes')} onClick={() => setTab('routes')}>
                  Routes
                </button>
                <button type="button" role="tab" aria-selected={tab === 'checkpoints'} className={tabClass('checkpoints')} onClick={() => setTab('checkpoints')}>
                  Checkpoints{selectedRoute && ` (${selectedRoute.name})`}
                </button>
              </div>
              {tab === 'routes'
                ? <RouteCards routes={plan.routes} selected={selected} onSelect={selectRoute} />
                : selectedRoute && <CheckpointList route={selectedRoute} focus={focus} onFocus={focusCheckpoint} />}
              <p className="text-xs leading-relaxed text-slate-400">
                Routes are ranked by fewest Severe miles, then High miles, then average risk, then trip time.
                Any route with No Travel goes last. Routing by {plan.provider}.
              </p>
            </>
          )}
        </div>
      </aside>

      <main className="relative h-[85vh] shrink-0 md:h-auto md:flex-1">
        {/* isolate: map markers and popups stay below the panels drawn over the map */}
        <div className="absolute inset-0 isolate">
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-400">Loading map…</div>}>
            <MapView plan={plan} heatmap={heatmap} hour={shownHour} metric={metric} showHeatmap={showHeat}
              selected={selected} onSelectRoute={selectRoute} focus={focus} onFocus={focusCheckpoint} />
          </Suspense>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 hidden sm:block"><MapLegend /></div>

        {!plan && !loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4"><EmptyState /></div>}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50">
            <div className="flex items-center gap-2.5 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              <Loader2 size={16} className="animate-spin text-ink" />
              Finding routes and checking the forecast along each one…
            </div>
          </div>
        )}

        {plan && !loading && (
          <div className="absolute bottom-4 left-1/2 w-[min(680px,calc(100%-2rem))] -translate-x-1/2">
            <TimelinePanel heatmap={heatmap} loading={heatLoading} route={selectedRoute}
              hour={shownHour} onHour={setHour} metric={metric} onMetric={setMetric}
              showHeatmap={showHeat} onShowHeatmap={setShowHeat} />
          </div>
        )}
      </main>
    </div>
  )
}
