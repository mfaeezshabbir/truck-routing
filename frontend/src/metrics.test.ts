import { describe, expect, it } from 'vitest'
import { metricLevel } from './metrics'
import { fmtDuration } from './risk'

// Mirrors backend/routing/tests/test_risk.py: heatmap colours must use the same bands as the API.
describe('metricLevel', () => {
  it('wind bands are [lower, next lower)', () => {
    expect([24.9, 25, 34.9, 35, 45, 54.9, 55].map(v => metricLevel('wind_mph', v))).toEqual([0, 1, 1, 2, 3, 3, 4])
  })
  it('rain: 0.25 is High, 1.00 is Severe, only >1.00 is No Travel', () => {
    expect([0.09, 0.1, 0.25, 0.5, 1.0, 1.01].map(v => metricLevel('rain_in_hr', v))).toEqual([0, 1, 2, 3, 3, 4])
  })
  it('snow: 3.0 is Severe, only >3.0 is No Travel', () => {
    expect([0.4, 0.5, 1, 2, 3, 3.1].map(v => metricLevel('snow_in_hr', v))).toEqual([0, 1, 2, 3, 3, 4])
  })
  it('risk levels map to themselves', () => {
    expect([0, 1, 2, 3, 4].map(v => metricLevel('risk', v))).toEqual([0, 1, 2, 3, 4])
  })
})

describe('fmtDuration', () => {
  it('formats hours and zero-padded minutes', () => {
    expect(fmtDuration(3600 * 25 + 60 * 5)).toBe('25h 05m')
  })
})
