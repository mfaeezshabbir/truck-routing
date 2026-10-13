import type { Route } from './types'

export type TruckStatus = 'waiting' | 'driving' | 'break' | 'rest' | 'arrived'
export interface TruckPosition { lon: number; lat: number; mile: number; status: TruckStatus }

interface Knot { t: number; lon: number; lat: number; mile: number; stop?: 'break' | 'rest' }

/** Time-ordered points the truck passes: checkpoints plus the start and end of each HOS stop. */
function knots(route: Route): Knot[] {
  const k: Knot[] = route.checkpoints.map(c => ({ t: Date.parse(c.eta), lon: c.lon, lat: c.lat, mile: c.mile }))
  for (const s of route.stops) {
    k.push({ t: Date.parse(s.start), lon: s.lon, lat: s.lat, mile: s.mile, stop: s.kind })
    k.push({ t: Date.parse(s.end), lon: s.lon, lat: s.lat, mile: s.mile })
  }
  return k.sort((a, b) => a.t - b.t || a.mile - b.mile)
}

/**
 * Where the truck on `route` is at time `iso` (straight-line interpolation between consecutive knots,
 * so it is approximate between checkpoints but exact at checkpoints and stops).
 */
export function truckAt(route: Route, iso: string): TruckPosition | null {
  const k = knots(route)
  if (!k.length) return null
  const t = Date.parse(iso)
  if (t <= k[0].t) return { ...pick(k[0]), status: 'waiting' }
  const last = k[k.length - 1]
  if (t >= last.t) return { ...pick(last), status: 'arrived' }
  let i = 0
  while (k[i + 1].t < t) i++
  const a = k[i], b = k[i + 1]
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
  return {
    lon: a.lon + (b.lon - a.lon) * f, lat: a.lat + (b.lat - a.lat) * f, mile: a.mile + (b.mile - a.mile) * f,
    status: a.stop ?? 'driving',
  }
}

const pick = ({ lon, lat, mile }: Knot) => ({ lon, lat, mile })

export const STATUS_LABEL: Record<TruckStatus, string> = {
  waiting: 'Not departed', driving: 'Driving', break: '30 min break', rest: '10 h rest', arrived: 'Arrived',
}
