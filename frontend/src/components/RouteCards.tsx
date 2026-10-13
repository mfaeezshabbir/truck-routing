import type { Route } from '../types'
import { RISK_BADGE, RISK_COLORS, RISK_LABELS, fmtDuration, fmtTime } from '../risk'

function stopSummary(r: Route) {
  const breaks = r.stops.filter(s => s.kind === 'break').length
  const rests = r.stops.length - breaks
  return [breaks && `${breaks}× 30 min break`, rests && `${rests}× 10 h rest`].filter(Boolean).join(' · ')
}

export default function RouteCards({ routes, selected, onSelect }: { routes: Route[]; selected: number | null; onSelect: (id: number) => void }) {
  const sorted = [...routes].sort((a, b) => a.rank - b.rank)
  return (
    <div className="space-y-3">
      {sorted.map(r => {
        const s = r.summary
        const total = Object.values(s.miles_by_level).reduce((a, b) => a + b, 0) || 1
        return (
          <button key={r.id} onClick={() => onSelect(r.id)}
            className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow ${selected === r.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                <span className="font-semibold text-slate-900">{r.name}</span>
                {r.recommended && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Recommended</span>}
                {s.has_no_travel && <span className="rounded-full bg-purple-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">No Travel</span>}
              </div>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${RISK_BADGE[s.max_level]}`}>Max: {s.max_label}</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-slate-600">
              <div><div className="text-slate-400">Distance</div><div className="font-semibold text-slate-800">{r.distance_mi.toFixed(0)} mi</div></div>
              <div><div className="text-slate-400">Driving</div><div className="font-semibold text-slate-800">{fmtDuration(r.duration_s)}</div></div>
              <div title="Driving plus hours-of-service breaks/rests"><div className="text-slate-400">Trip</div><div className="font-semibold text-slate-800">{fmtDuration(r.trip_duration_s)}</div></div>
              <div><div className="text-slate-400">Avg risk</div><div className="font-semibold text-slate-800">{s.avg_risk.toFixed(2)} / 4</div></div>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100" title="Miles by risk level">
              {RISK_LABELS.map((l, i) => (
                <div key={l} style={{ width: `${(100 * (s.miles_by_level[l] ?? 0)) / total}%`, background: RISK_COLORS[i] }} />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
              <span>Severe {s.severe_miles.toFixed(0)} mi · High {s.high_miles.toFixed(0)} mi</span>
              <span>Arrive {fmtTime(r.arrival)}</span>
            </div>
            {r.stops.length > 0 && (
              <div className="mt-1 text-[11px] text-slate-500">
                HOS: {stopSummary(r)}
              </div>
            )}
            <div className={`mt-1.5 text-[11px] ${r.recommended ? 'font-medium text-emerald-800' : 'text-slate-600'}`}>{r.reason}</div>
          </button>
        )
      })}
    </div>
  )
}
