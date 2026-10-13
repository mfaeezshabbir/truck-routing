import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { Heatmap, Route } from '../types'
import { METRICS, type Metric } from '../metrics'
import { RISK_COLORS, fmtTime } from '../risk'
import { STATUS_LABEL, truckAt } from '../timeline'

interface Props {
  heatmap: Heatmap | null; loading: boolean; route: Route | undefined
  hour: number; onHour: (h: number) => void
  metric: Metric; onMetric: (m: Metric) => void
  showHeatmap: boolean; onShowHeatmap: (v: boolean) => void
}

const STEP_MS = 450

export default function TimelinePanel({ heatmap, loading, route, hour, onHour, metric, onMetric, showHeatmap, onShowHeatmap }: Props) {
  const [playing, setPlaying] = useState(false)
  const last = heatmap ? heatmap.hours.length - 1 : 0

  const isPlaying = playing && hour < last
  useEffect(() => {
    if (!isPlaying) return
    const t = setTimeout(() => onHour(hour + 1), STEP_MS)
    return () => clearTimeout(t)
  }, [isPlaying, hour, onHour])

  const time = heatmap?.hours[hour]
  const truck = route && time ? truckAt(route, time) : null

  return (
    <div className="rounded-md border border-slate-300 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" className="accent-ink" checked={showHeatmap} onChange={e => onShowHeatmap(e.target.checked)} /> Weather layer
        </label>
        <div className="flex gap-1 rounded-md bg-slate-100 p-1" role="group" aria-label="Weather layer">
          {(Object.keys(METRICS) as Metric[]).map(id => (
            <button type="button" key={id} onClick={() => onMetric(id)} aria-pressed={metric === id}
              className={`rounded px-2.5 py-0.5 text-xs ${metric === id ? 'bg-white font-medium text-slate-900 ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900'}`}>
              {METRICS[id].label}
            </button>
          ))}
        </div>
      </div>

      {heatmap ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <button type="button"
              onClick={() => {
                if (isPlaying) { setPlaying(false); return }
                if (hour >= last) onHour(0)
                setPlaying(true)
              }}
              aria-label={isPlaying ? 'Pause' : 'Play the forecast'}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white hover:bg-ink/90">
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
            <div className="flex-1">
              <input type="range" aria-label="Hours after departure" aria-valuetext={`+${hour} hours, ${time ? fmtTime(time) : ''}`}
                min={0} max={last} value={hour} onChange={e => { setPlaying(false); onHour(Number(e.target.value)) }}
                className="block w-full accent-ink" />
              <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>Departure</span><span>+{last} h</span></div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
            <span aria-live="polite"><span className="font-semibold text-slate-900">+{hour} h</span> <span className="text-slate-500">{time && fmtTime(time)}</span></span>
            {truck && route && (
              <span className="text-slate-600">
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: route.color }} />
                {route.name}: {STATUS_LABEL[truck.status].toLowerCase()}{truck.status !== 'waiting' && `, mile ${truck.mile.toFixed(0)}`}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            <span className="text-slate-600">{METRICS[metric].label} ({METRICS[metric].unit})</span>
            {METRICS[metric].legend.map((l, i) => (
              <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: RISK_COLORS[i] }} />{l}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 text-xs text-slate-500">{loading ? 'Loading the 48 h forecast for the corridor…' : 'Weather layer unavailable.'}</div>
      )}
    </div>
  )
}
