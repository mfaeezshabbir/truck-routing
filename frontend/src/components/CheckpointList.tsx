import type { ReactNode } from 'react'
import type { Focus, Route } from '../types'
import { LOCAL_TZ_ABBR, RISK_BADGE, fmtShort } from '../risk'

/** Timeline of the selected route: checkpoints (clickable, pans the map) interleaved with HOS stops. */
export default function CheckpointList({ route, focus, onFocus }: { route: Route; focus: Focus | null; onFocus: (f: Focus) => void }) {
  type Row = { mile: number; el: ReactNode }
  const rows: Row[] = route.checkpoints.map((cp, i) => {
    const active = focus?.route === route.id && focus.idx === i
    return {
      mile: cp.mile,
      el: (
        <tr key={`c${i}`} onClick={() => onFocus({ route: route.id, idx: i, fly: true })}
          className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${active ? 'bg-blue-50' : ''}`}>
          <td className="py-1 pr-2 tabular-nums">{cp.mile.toFixed(0)}</td>
          <td className="whitespace-nowrap pr-2">{fmtShort(cp.eta)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.wind_mph.toFixed(0)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.rain_in_hr.toFixed(2)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.snow_in_hr.toFixed(2)}</td>
          <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${RISK_BADGE[cp.risk.level]}`}>{cp.risk.label}</span></td>
        </tr>
      ),
    }
  })
  route.stops.forEach((s, i) => rows.push({
    mile: s.mile,
    el: (
      <tr key={`s${i}`} className="border-t border-slate-100 bg-slate-50 text-slate-500">
        <td className="py-1 pr-2 tabular-nums">{s.mile.toFixed(0)}</td>
        <td colSpan={5}>{s.kind === 'rest' ? '10 h rest' : '30 min break'} · {fmtShort(s.start)} → {fmtShort(s.end)}</td>
      </tr>
    ),
  }))
  rows.sort((a, b) => a.mile - b.mile)

  return (
    <details open className="rounded-xl border border-slate-200 bg-white text-xs">
      <summary className="cursor-pointer px-3 py-2 font-semibold text-slate-800">
        {route.name} checkpoints ({route.checkpoints.length}{route.stops.length ? `, ${route.stops.length} HOS stops` : ''})
      </summary>
      <div className="max-h-72 overflow-auto px-3 pb-2">
        <table className="w-full text-left text-slate-700">
          <thead className="sticky top-0 bg-white text-[10px] uppercase text-slate-400">
            <tr><th className="pr-2 font-medium">Mi</th><th className="pr-2 font-medium">ETA {LOCAL_TZ_ABBR}</th><th className="pr-2 font-medium">Wind mph</th>
              <th className="pr-2 font-medium">Rain in/h</th><th className="pr-2 font-medium">Snow in/h</th><th className="font-medium">Risk</th></tr>
          </thead>
          <tbody>{rows.map(r => r.el)}</tbody>
        </table>
      </div>
    </details>
  )
}
