import { useState } from 'react'
import { ArrowUpDown, Calendar, Circle, MapPin, Package } from 'lucide-react'
import type { PlanRequest } from '../types'
import { LOCAL_TZ, LOCAL_TZ_ABBR } from '../risk'

function defaultDeparture() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const EXAMPLES: [string, string][] = [
  ['Dallas, TX', 'Denver, CO'], ['Chicago, IL', 'Denver, CO'], ['Salt Lake City, UT', 'Seattle, WA'],
  ['Islamabad, Pakistan', 'Kashgar, China'],
]

interface Props { onSubmit: (r: PlanRequest) => void; loading: boolean; collapsed: boolean; onExpand: () => void }

const field = 'flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 focus-within:border-ink focus-within:ring-2 focus-within:ring-ink/15'
const input = 'w-full bg-transparent py-2 text-sm outline-none'
const label = 'mb-1 block text-xs font-medium text-slate-600'

export default function TripForm({ onSubmit, loading, collapsed, onExpand }: Props) {
  const [origin, setOrigin] = useState('Dallas, TX')
  const [destination, setDestination] = useState('Denver, CO')
  const [departure, setDeparture] = useState(defaultDeparture())
  const [load, setLoad] = useState(35000)
  const [intervalMi, setIntervalMi] = useState<10 | 25 | 50>(25)
  const [formError, setFormError] = useState<string | null>(null)

  if (collapsed) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{origin.split(',')[0]} → {destination.split(',')[0]}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {new Date(departure).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {' · '}{load.toLocaleString()} lb · every {intervalMi} mi
          </div>
        </div>
        <button type="button" onClick={onExpand} className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
          Edit trip
        </button>
      </div>
    )
  }

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) { setFormError('Origin and destination must differ.'); return }
        setFormError(null)
        onSubmit({ origin, destination, departure: new Date(departure).toISOString(), load_lb: load, interval_mi: intervalMi })
      }}
    >
      <div>
        <div className="space-y-2">
          <div>
            <label htmlFor="origin" className={label}>From</label>
            <div className={field}><Circle size={13} className="shrink-0 text-slate-400" />
              <input id="origin" autoComplete="off" className={input} value={origin} onChange={e => setOrigin(e.target.value)} required /></div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="destination" className={label}>To</label>
              <button type="button" onClick={() => { setOrigin(destination); setDestination(origin) }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
                <ArrowUpDown size={12} /> Swap
              </button>
            </div>
            <div className={field}><MapPin size={14} className="shrink-0 text-slate-400" />
              <input id="destination" autoComplete="off" className={input} value={destination} onChange={e => setDestination(e.target.value)} required /></div>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Try{' '}
          {EXAMPLES.map(([o, d], i) => (
            <span key={o + d}>
              <button type="button" onClick={() => { setOrigin(o); setDestination(d) }} className="text-ink underline decoration-slate-300 underline-offset-2 hover:decoration-ink">
                {o.split(',')[0]} → {d.split(',')[0]}
              </button>
              {i < EXAMPLES.length - 1 && ', '}
            </span>
          ))}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_8.5rem] gap-2">
        <div>
          <label htmlFor="departure" className={label} title={LOCAL_TZ}>Departure <span className="font-normal text-slate-400">({LOCAL_TZ_ABBR})</span></label>
          <div className={field}><Calendar size={14} className="shrink-0 text-slate-400" />
            <input id="departure" type="datetime-local" className={input} value={departure} onChange={e => setDeparture(e.target.value)} required /></div>
        </div>
        <div>
          <label htmlFor="load" className={label}>Load (lb)</label>
          <div className={field}><Package size={14} className="shrink-0 text-slate-400" />
            <input id="load" type="number" min={0} max={200000} step={500} className={input} value={load} onChange={e => setLoad(Number(e.target.value))} required /></div>
        </div>
      </div>

      <div>
        <span id="interval-label" className={label}>Check the weather every</span>
        <div className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1" role="group" aria-labelledby="interval-label">
          {([10, 25, 50] as const).map(v => (
            <button type="button" key={v} onClick={() => setIntervalMi(v)} aria-pressed={intervalMi === v}
              className={`rounded py-1 text-sm ${intervalMi === v ? 'bg-white font-medium text-slate-900 ring-1 ring-slate-300' : 'text-slate-600 hover:text-slate-900'}`}>
              {v} mi
            </button>
          ))}
        </div>
      </div>

      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <button type="submit" disabled={loading}
        className="w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white hover:bg-ink/90 disabled:opacity-60">
        {loading ? 'Planning…' : 'Plan trip'}
      </button>
    </form>
  )
}
