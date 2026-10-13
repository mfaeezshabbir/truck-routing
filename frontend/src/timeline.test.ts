import { describe, expect, it } from 'vitest'
import { truckAt } from './timeline'
import type { Checkpoint, Route } from './types'

const cp = (mile: number, lat: number, eta: string) => ({ mile, lat, lon: 0, eta }) as Checkpoint
const route = {
  checkpoints: [cp(0, 0, '2026-10-13T00:00:00Z'), cp(100, 1, '2026-10-13T10:00:00Z')],
  // break at mile 50 from 04:00 to 06:00 (exaggerated for the test)
  stops: [{ kind: 'break', mile: 50, lat: 0.5, lon: 0, duration_s: 7200, start: '2026-10-13T04:00:00Z', end: '2026-10-13T06:00:00Z' }],
} as unknown as Route

describe('truckAt', () => {
  it('waits at the origin before departure and stays at the destination after arrival', () => {
    expect(truckAt(route, '2026-10-12T23:00:00Z')).toMatchObject({ mile: 0, status: 'waiting' })
    expect(truckAt(route, '2026-10-13T12:00:00Z')).toMatchObject({ mile: 100, status: 'arrived' })
  })
  it('interpolates while driving and holds still during a stop', () => {
    expect(truckAt(route, '2026-10-13T02:00:00Z')).toMatchObject({ mile: 25, status: 'driving' })
    expect(truckAt(route, '2026-10-13T05:00:00Z')).toMatchObject({ mile: 50, status: 'break' })
    expect(truckAt(route, '2026-10-13T08:00:00Z')).toMatchObject({ mile: 75, status: 'driving' })
  })
})
