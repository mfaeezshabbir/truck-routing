import type * as GeoJSON from "geojson"
export type RiskLevel = 0 | 1 | 2 | 3 | 4

export interface Weather {
  wind_mph: number; gust_mph: number; precip_in_hr: number; rain_in_hr: number; snow_in_hr: number
}
export interface Checkpoint {
  lat: number; lon: number; mile: number; segment_miles: number; eta: string; forecast_hour: string | null
  weather: Weather
  risk: { level: RiskLevel; label: string; components: Record<string, number>; factors: string[] }
}
export interface Summary {
  miles_by_level: Record<string, number>; severe_miles: number; high_miles: number; no_travel_miles: number
  avg_risk: number; max_level: RiskLevel; max_label: string; has_no_travel: boolean; duration_s: number
}
/** A mandatory hours-of-service stop: 30-min break after 8 h driving, 10-h rest after 11 h. */
export interface Stop {
  kind: 'break' | 'rest'; lat: number; lon: number; mile: number; duration_s: number; start: string; end: string
}
export interface Route {
  id: number; name: string; color: string; distance_mi: number
  duration_s: number; trip_duration_s: number; arrival: string; stops: Stop[]
  geometry: GeoJSON.LineString; checkpoints: Checkpoint[]; summary: Summary
  rank: number; recommended: boolean; reason: string
}
export interface Place { lat: number; lon: number; label: string }
export interface Plan {
  plan_id: string; provider: string; origin: Place; destination: Place; departure: string; load_lb: number
  interval_mi: number; recommended_route_id: number | null; warning: string | null; routes: Route[]
}
export interface Heatmap {
  plan_id: string; departure: string; points: [number, number][]; radius_mi: number; hours: string[]
  risk: number[][]; wind_mph: number[][]; rain_in_hr: number[][]; snow_in_hr: number[][]
}
export interface PlanRequest {
  origin: string; destination: string; departure: string; load_lb: number; interval_mi: 10 | 25 | 50
}
/** A checkpoint picked on the map or in the list; `fly` asks the map to pan to it. */
export interface Focus { route: number; idx: number; fly?: boolean }
