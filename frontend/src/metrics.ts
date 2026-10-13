import type { ExpressionSpecification } from 'maplibre-gl'
import { RISK_LABELS } from './risk'

export type Metric = 'risk' | 'wind_mph' | 'rain_in_hr' | 'snow_in_hr'

// Lower bounds of Moderate, High, Severe, No Travel per metric (the spec's table). A value v has level =
// number of bounds <= v. Rain/snow No Travel is strictly ">", hence the tiny epsilon.
const EPS = 1e-6
export const METRICS: Record<Metric, { label: string; unit: string; bounds: number[]; legend: string[] }> = {
  risk: { label: 'Risk', unit: 'incl. load rules', bounds: [1, 2, 3, 4], legend: RISK_LABELS },
  wind_mph: { label: 'Wind', unit: 'mph', bounds: [25, 35, 45, 55], legend: ['<25', '25–34', '35–44', '45–54', '≥55'] },
  rain_in_hr: { label: 'Rain', unit: 'in/hr', bounds: [0.1, 0.25, 0.5, 1 + EPS], legend: ['<0.10', '0.10–0.25', '0.25–0.50', '0.50–1.00', '>1.00'] },
  snow_in_hr: { label: 'Snow', unit: 'in/hr', bounds: [0.5, 1, 2, 3 + EPS], legend: ['<0.5', '0.5–1.0', '1.0–2.0', '2.0–3.0', '>3.0'] },
}

export const metricLevel = (m: Metric, v: number) => METRICS[m].bounds.filter(b => v >= b).length

/** MapLibre expression giving the 0–4 level of `metric` at forecast hour `hour` (feature property `${m}_${h}`). */
export function levelExpression(m: Metric, hour: number): ExpressionSpecification {
  const [b1, b2, b3, b4] = METRICS[m].bounds
  return ['step', ['coalesce', ['get', `${m}_${hour}`], 0], 0, b1, 1, b2, 2, b3, 3, b4, 4]
}
