import { useEffect, useRef, type ReactNode } from 'react'
import { BedDouble, Coffee } from 'lucide-react'
import type { Focus, Route } from '../types'
import { LOCAL_TZ_ABBR, RISK_BADGE, fmtShort } from '../risk'

/** Checkpoints of one route in driving order, with the HOS stops in between. Clicking a row shows it on the map. */
export default function CheckpointList({ route, focus, onFocus }: { route: Route; focus: Focus | null; onFocus: (f: Focus) => void }) {
  const activeRow = useRef<HTMLTableRowElement>(null)
  useEffect(() => { activeRow.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [focus])

  type Row = { mile: number; el: ReactNode }
  const rows: Row[] = route.checkpoints.map((cp, i) => {
    const active = focus?.route === route.id && focus.idx === i
    return {
      mile: cp.mile,
      el: (
        <tr key={`c${i}`} ref={active ? activeRow : undefined} onClick={() => onFocus({ route: route.id, idx: i, fly: true })}
          className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${active ? 'bg-ink-soft' : ''}`}>
          <td className="py-1.5 pr-2 tabular-nums">{cp.mile.toFixed(0)}</td>
          <td className="whitespace-nowrap pr-2">{fmtShort(cp.eta)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.wind_mph.toFixed(0)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.rain_in_hr.toFixed(2)}</td>
          <td className="pr-2 tabular-nums">{cp.weather.snow_in_hr.toFixed(2)}</td>
          <td className={`font-medium ${RISK_BADGE[cp.risk.level]}`}>{cp.risk.label}</td>
        </tr>
      ),
    }
  })
  route.stops.forEach((s, i) => rows.push({
    mile: s.mile,
    el: (
      <tr key={`s${i}`} className="border-t border-slate-100 bg-slate-50 text-slate-500">
        <td className="py-1.5 pr-2 tabular-nums">{s.mile.toFixed(0)}</td>
        <td colSpan={5}>
          <span className="inline-flex items-center gap-1.5">
            {s.kind === 'rest' ? <BedDouble size={13} /> : <Coffee size={13} />}
            {s.kind === 'rest' ? '10 h rest' : '30 min break'}, {fmtShort(s.start)} to {fmtShort(s.end)}
          </span>
        </td>
      </tr>
    ),
  }))
  rows.sort((a, b) => a.mile - b.mile)

  return (
    <div className="text-xs">
      <div className="pb-2 text-slate-500">
        {route.checkpoints.length} checkpoints{route.stops.length ? ` and ${route.stops.length} required stops` : ''}. Click a row to find it on the map.
      </div>
      <div className="max-h-[55vh] overflow-auto">
        <table className="w-full text-left text-slate-700">
          <thead className="sticky top-0 bg-white text-[11px] text-slate-500">
            <tr><th className="pb-1.5 pr-2 font-medium">Mile</th><th className="pr-2 font-medium">ETA {LOCAL_TZ_ABBR}</th><th className="pr-2 font-medium">Wind mph</th>
              <th className="pr-2 font-medium">Rain in/h</th><th className="pr-2 font-medium">Snow in/h</th><th className="font-medium">Risk</th></tr>
          </thead>
          <tbody>{rows.map(r => r.el)}</tbody>
        </table>
      </div>
    </div>
  )
}
