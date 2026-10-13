import { CircleCheck, OctagonAlert } from 'lucide-react'
import type { Plan, Route } from '../types'
import { RISK_BADGE, RISK_COLORS, RISK_LABELS, fmtDuration, fmtTime } from '../risk'

function stopSummary(r: Route) {
  const breaks = r.stops.filter(s => s.kind === 'break').length
  const rests = r.stops.length - breaks
  return [breaks && `${breaks} × 30 min break`, rests && `${rests} × 10 h rest`].filter(Boolean).join(', ')
}

function RiskBar({ route }: { route: Route }) {
  const s = route.summary
  const total = Object.values(s.miles_by_level).reduce((a, b) => a + b, 0) || 1
  return (
    <div className="flex h-1.5 gap-px overflow-hidden rounded-full bg-slate-100" title={RISK_LABELS.map(l => `${l}: ${(s.miles_by_level[l] ?? 0).toFixed(0)} mi`).join('\n')}>
      {RISK_LABELS.map((l, i) => (s.miles_by_level[l] ?? 0) > 0 && (
        <div key={l} style={{ width: `${(100 * s.miles_by_level[l]) / total}%`, background: RISK_COLORS[i] }} />
      ))}
    </div>
  )
}

export function Recommendation({ plan }: { plan: Plan }) {
  const best = plan.routes.find(r => r.id === plan.recommended_route_id)
  if (!best) {
    return (
      <div role="alert" className="flex gap-2.5 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm">
        <OctagonAlert size={18} className="mt-px shrink-0 text-purple-700" />
        <div>
          <div className="font-semibold text-purple-900">No safe route at this time</div>
          <div className="mt-0.5 text-purple-800">{plan.warning}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2.5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <CircleCheck size={18} className="mt-px shrink-0 text-emerald-700" />
      <div>
        <div className="font-semibold text-emerald-950">Take {best.name}</div>
        <div className="mt-0.5 text-emerald-900/85">{best.reason}</div>
      </div>
    </div>
  )
}

const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div>
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className={`text-sm font-medium ${tone ?? 'text-slate-900'}`}>{value}</div>
  </div>
)

export default function RouteCards({ routes, selected, onSelect }: { routes: Route[]; selected: number | null; onSelect: (id: number) => void }) {
  const sorted = [...routes].sort((a, b) => a.rank - b.rank)
  return (
    <div className="space-y-2">
      {sorted.map(r => {
        const s = r.summary
        const active = selected === r.id
        return (
          <button key={r.id} type="button" onClick={() => onSelect(r.id)} aria-pressed={active}
            className={`block w-full rounded-md border p-3 text-left transition-colors ${active ? 'border-ink bg-ink-soft/50' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <span className="font-semibold">{r.name}</span>
                {r.recommended && <span className="text-xs font-medium text-emerald-700">Recommended</span>}
                {s.has_no_travel && <span className="text-xs font-medium text-purple-700">No Travel on route</span>}
              </div>
              <span className="text-xs text-slate-500">Worst <span className={`font-medium ${RISK_BADGE[s.max_level]}`}>{s.max_label}</span></span>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              <Stat label="Distance" value={`${r.distance_mi.toFixed(0)} mi`} />
              <Stat label="Trip time" value={fmtDuration(r.trip_duration_s)} />
              <Stat label="Severe" value={`${s.severe_miles.toFixed(0)} mi`} tone={s.severe_miles > 0 ? 'text-red-700' : undefined} />
              <Stat label="High" value={`${s.high_miles.toFixed(0)} mi`} tone={s.high_miles > 0 ? 'text-orange-700' : undefined} />
            </div>
            <div className="mt-3"><RiskBar route={r} /></div>
            <div className="mt-2 text-xs text-slate-500">Arrives {fmtTime(r.arrival)}</div>
            {active && (
              <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2 text-xs text-slate-600">
                <div>Driving {fmtDuration(r.duration_s)}{r.stops.length > 0 && `, plus ${stopSummary(r)}`}. Average risk {s.avg_risk.toFixed(2)} of 4.</div>
                {!r.recommended && <div>{r.reason}</div>}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
