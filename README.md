# Weather-Aware Truck Routing (Spotter take-home)

React (Vite + TypeScript + Tailwind + MapLibre) frontend and Django 5 / DRF backend that compares up to
three truck routes by forecast weather **at the truck's ETA** at each checkpoint, applies the load rules,
and recommends the safest route.

```
backend/   Django project (config/) + app routing/ (risk.py, geo.py, services.py, planner.py, views.py, tests/)
frontend/  Vite React app (src/components/MapView.tsx, RouteCards.tsx, TripForm.tsx)
render.yaml  Render blueprint for the backend      frontend/vercel.json  Vercel config for the frontend
```

## Setup

```bash
# backend
cd backend
python3 -m venv venv && . venv/bin/activate
pip install -r requirements.txt
export ORS_API_KEY=...          # optional; see "Routing" below
python manage.py runserver 8000
pytest -q                        # unit tests (risk, load, recommendation, sampling)

# frontend (dev server proxies /api -> :8000)
cd frontend
npm install
npm run dev                      # http://localhost:5173
npm run build                    # production build in dist/
```
For a deployed frontend set `VITE_API_BASE=https://<backend-host>`; for the backend set
`CORS_ALLOWED_ORIGINS=https://<frontend-host>`. See `.env.example`.

## API

`POST /api/plan`
```json
{"origin":"Dallas, TX","destination":"Denver, CO","departure":"2026-10-14T13:00:00Z","load_lb":35000,"interval_mi":25}
```
Returns `plan_id`, geocoded origin/destination, `recommended_route_id`, and `routes[]` with geometry,
distance, duration, arrival, `checkpoints[]` (lat/lon, mile, ETA, forecast hour used, wind/gust/rain/snow, risk
level + driving factors) and `summary` (miles per risk level, severe/high miles, mileage-weighted average risk,
max level, `has_no_travel`), plus `rank` and `recommended`.

`GET /api/heatmap?plan_id=...` — a corridor grid (points on and ~30 mi either side of every route, de-duplicated)
with hourly risk / wind / rain / snow for hours 0–48 after departure. Fetched once per plan; the slider is fully
client-side (each hour is a feature property and only the heatmap paint expression changes, so no data re-upload).

`GET /health` and `GET /api/health` → `{"ok": true}`

MapLibre worker: Vite pre-bundling breaks maplibre-gl's default worker URL, so `src/maplibre-setup.ts` sets it explicitly with `setWorkerUrl(import "…/maplibre-gl-worker.mjs?url")` (served in dev, emitted as a hashed asset in builds).

## API choices

| Need | Service | Notes |
|---|---|---|
| Geocoding | Nominatim (OSM) with identifying User-Agent, Photon fallback; ORS geocoder when a key is set | free, no key |
| Routing | **OpenRouteService `driving-hgv`** with `alternative_routes` (target 3) when `ORS_API_KEY` is set | truck profile |
| Routing fallback | **OSRM public demo** (`router.project-osrm.org`, `alternatives=3`) | car profile; demo often returns <3 alternatives, so extra alternatives are synthesised by forcing a via-point offset perpendicular at the trip midpoint (18% / 30% of the straight-line distance, each side), keeping only candidates ≤1.6× the fastest duration that overlap existing routes <80% |
| Weather | **Open-Meteo** hourly forecast, multi-location batch (100 points/request) | `wind_speed_unit=mph`, `precipitation_unit=inch` (so snowfall is inches/hour) |

Responses (geocodes, routes) are cached in memory; a plan's route lines are cached for 1 h for the heatmap call.

## Logic

1. Geocode, fetch up to 3 routes.
2. Checkpoints at mile 0, every N miles (10/25/50), and the destination.
3. ETA = departure + cumulative route duration at that point. Per-segment durations come from OSRM
   annotations / ORS step durations (so slow city stretches are respected), interpolated within a segment and
   scaled to the engine's total duration.
4. All checkpoints of all routes are fetched in one batched Open-Meteo call; the forecast hour **nearest** the ETA is used.
5. Checkpoint risk = worst of wind / rain / snow levels, then the load rules can only raise it.
6. Route summary is **mileage-weighted**: each checkpoint represents half the distance to each neighbour
   (so at 25 mi interior checkpoints each represent 25 mi, the endpoints 12.5 mi, and the sum equals route length).
7. Ranking: routes with any No Travel checkpoint last (and never "Recommended"), then fewest Severe miles,
   fewest High miles, lowest average risk, shortest travel time. If every route has No Travel, no route is
   recommended and a warning suggests delaying departure.

### Assumptions
* **Overlapping/gapped bins.** The table uses ranges like 25–34 / 35–44 mph and 0.10–0.25 / 0.25–0.50 in.
  Each bin is treated as `[lower, next lower)`: 34.6 mph is Moderate, 0.25 in/hr is High, 0.50 is Severe,
  2.0 in/hr snow is Severe. Upper extremes follow the spec literally: rain **1.00 in/hr is Severe**, only
  `>1.00` is No Travel; snow **3.0 is Severe**, only `>3.0` is No Travel; wind `≥55` is No Travel.
* **Wind** = sustained 10 m wind speed (gusts are shown but not scored). Load rules use the same value;
  ">30,000 lb" / ">40,000 lb" are strict.
* **Rain** = Open-Meteo `rain + showers` (liquid only, in/hr); snow = `snowfall` in in/hr.
* **Interval** is measured along the route polyline (not straight-line), starting at the origin.
* **Average risk** = Σ(level × miles) / total miles on the 0–4 scale (Low 0 … No Travel 4).
* Ties in severe/high miles are compared at 0.1 mi resolution.
* Departure must be within the forecast horizon (now − 1 h … now + 13 days).
* Heatmap hours beyond the forecast window clamp to the last available hour.

## Gaps / next steps
* Without an ORS key the routes come from OSRM's **car** profile (no truck restrictions); set `ORS_API_KEY` for HGV.
* Public demo servers (OSRM, Nominatim) are rate-limited and not for production load.
* In-memory cache is per process; use Redis for multi-worker deployments.
