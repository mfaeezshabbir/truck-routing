# Truck Routing

Pick the route that won't put a loaded truck in a 50 mph crosswind.

You give it a start, a destination, a departure time and the load. It finds up to three truck routes,
checks the forecast along each one for the hour the truck actually gets there, and tells you which one to
take and why.

Live app: (link coming after deploy)
Walkthrough: (link coming)

React + MapLibre on the front, Django + DRF on the back.

## Run it

```bash
# backend, port 8000
cd backend
python -m venv venv
venv\Scripts\activate          # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env        # add your ORS_API_KEY
python manage.py runserver 8000

# frontend, port 5173 (proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Tests: `pytest` in `backend/`, `npm test` in `frontend/`.

Get a free key at openrouteservice.org. Without it the app falls back to the public OSRM server, which
routes for cars. It works, but it doesn't know a truck can't take that bridge, and its times are too
optimistic for a rig.

## Weather at the wrong time is useless

This is the whole point of the app. Rain over Omaha at 9am doesn't matter if the truck rolls through at
6pm. So every checkpoint gets its own ETA, and the forecast is pulled for that place at that time.

ETAs include the stops a driver is legally required to take: a 30 minute break after 8 hours behind the
wheel, and a 10 hour rest after 11. Skip those and every checkpoint past hour 11 is checked against the
wrong weather. On Chicago to Denver that's the difference between arriving in 23 hours and 44.

Forecasts are hourly, so a 2:40 arrival blends the 2:00 and 3:00 values instead of rounding.

## Why your browser fetches the weather

Open-Meteo is free, but the limit is per IP address. A free Render server shares its IP with thousands of
other apps, and on day one the quota was already gone before this app made a single call. So the backend
does everything except download the forecast: it works out the routes, checkpoints and ETAs, tells the
browser exactly which forecast to fetch, and scores whatever comes back. Each visitor uses their own quota,
and the backend never touches Open-Meteo in production.

## Getting three routes

OpenRouteService has a proper truck profile, and I pass it the real gross weight (load plus about
35,000 lb of tractor and trailer). The catch: ORS only gives alternative routes for trips under 100 km.
For anything longer, I make my own by forcing a route through a point off to one side of the direct
line. Anything more than 1.6x slower than the fastest route, or mostly the same road, gets thrown out.

Sometimes there's only one road. Islamabad to Kashgar goes over the Karakoram Highway or not at all,
so you get one route, and the app says so.

## Scoring

Each checkpoint gets rated for wind, rain and snow using the table in the brief, and the worst of the
three wins. Then the load rules can make it worse, never better:

- 55+ mph wind: No Travel, whatever you're hauling
- 45 to 54 mph with more than 30,000 lb: No Travel
- 35 to 44 mph with more than 40,000 lb: Severe

Each checkpoint covers the road halfway to its neighbours, so a route ends up as so many miles of Low,
Moderate, High and so on. Routes are then ranked:

1. Any No Travel stretch sends the route to the bottom. It's never recommended.
2. Fewest Severe miles
3. Fewest High miles
4. Lowest average risk
5. Shortest trip

The app says why the winner won, e.g. "Recommended over Route B: Severe miles 0 vs 38". If every
route hits No Travel, it recommends nothing and tells you to leave at another time. It won't pick the
least bad way to drive into a storm.

## Calls I had to make

The brief's ranges share their edges (0.10-0.25, then 0.25-0.50). An edge value goes to the higher
level, so 0.25 in/hr of rain is High. The top row says "> 1.00" and "> 3.0", so exactly 1.00 in/hr of
rain and 3.0 of snow are Severe, not No Travel.

Wind means sustained wind. Gusts show up in the app but don't change the score, because the brief gives
one set of wind numbers and I didn't want to invent a second.

The hours-of-service rules are simplified. The driver starts fresh, and the weekly hour limits are
ignored.

## The map

Routes are drawn with their checkpoints coloured by risk. Hover a checkpoint to see its ETA and
weather. The Checkpoints tab lists every one, plus the rest stops, and clicking a row takes you there.

The weather layer covers about 30 miles either side of the routes, from departure to 48 hours out.
Switch between overall risk, wind, rain and snow. Drag the slider, or hit play, and a small truck moves
along each route so you can see what it would be driving into at that hour. All 48 hours load in one go,
so the slider never waits on the server.

## API

The app plans in two steps:

1. `POST /api/plan/prepare` with
   ```json
   {"origin": "Dallas, TX", "destination": "Denver, CO", "departure": "2026-10-14T13:00:00Z",
    "load_lb": 35000, "interval_mi": 25}
   ```
   returns a `plan_id` and the Open-Meteo query to run (points, hours, units).
2. `POST /api/plan/score` with `{plan_id, weather: {times, hourly}}` returns the routes, checkpoints with
   weather and risk, rest stops, and the pick.

The heatmap works the same way: `GET /api/heatmap/request?plan_id=...`, then `POST /api/heatmap`.

`POST /api/plan` and `GET /api/heatmap` still exist and do it all in one go with the server fetching the
weather. Handy locally, useless on a shared IP.

Bad input (unknown city, departure in the past, malformed weather) gets a 400 with a readable message.

## Deploy

Backend goes to Render via `render.yaml`. Set `ORS_API_KEY` and `CORS_ALLOWED_ORIGINS`. Frontend goes
to Vercel via `frontend/vercel.json`. Set `VITE_API_BASE` to the backend URL.

## What it won't catch

- A storm that sits between two checkpoints. Use 10 mile spacing if you're worried.
- Trips that end more than about 16 days out. That's as far as the forecast goes.
- Seasonal closures. The Khunjerab Pass is shut in winter and the router has no idea.
- Heavy traffic. It runs on free public APIs with rate limits. A visitor who plans a lot of long trips in
  one day can still run out of their own Open-Meteo quota.
