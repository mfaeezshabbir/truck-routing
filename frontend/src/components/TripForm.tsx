import { useState } from 'react'
import type { PlanRequest } from '../types'

function defaultDeparture() {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TripForm({ onSubmit, loading }: { onSubmit: (r: PlanRequest) => void; loading: boolean }) {
  const [origin, setOrigin] = useState('Dallas, TX')
  const [destination, setDestination] = useState('Denver, CO')
  const [departure, setDeparture] = useState(defaultDeparture())
  const [load, setLoad] = useState(35000)
  const [interval, setInterval] = useState<10 | 25 | 50>(25)

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'
  const label = 'mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500'

  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault()
        onSubmit({ origin, destination, departure: new Date(departure).toISOString(), load_lb: load, interval_mi: interval })
      }}
    >
      <div><label className={label}>Origin</label><input className={input} value={origin} onChange={e => setOrigin(e.target.value)} required /></div>
      <div><label className={label}>Destination</label><input className={input} value={destination} onChange={e => setDestination(e.target.value)} required /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-1">
        <div><label className={label}>Departure</label><input type="datetime-local" className={input} value={departure} onChange={e => setDeparture(e.target.value)} required /></div>
        <div><label className={label}>Load (lb)</label><input type="number" min={0} max={200000} step={500} className={input} value={load} onChange={e => setLoad(Number(e.target.value))} required /></div>
      </div>
      <div>
        <label className={label}>Weather checkpoint every</label>
        <div className="grid grid-cols-3 gap-2">
          {([10, 25, 50] as const).map(v => (
            <button type="button" key={v} onClick={() => setInterval(v)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${interval === v ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {v} mi
            </button>
          ))}
        </div>
      </div>
      <button disabled={loading} className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
        {loading ? 'Planning routes…' : 'Plan safest route'}
      </button>
    </form>
  )
}
