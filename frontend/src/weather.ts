// The browser fetches forecasts itself: Open-Meteo's free limit is per IP, and a shared hosting IP
// runs out of it. The backend says exactly what to ask for; this just runs that query.

export interface WeatherRequest {
  points: [number, number][] // [lat, lon]
  start_hour: string
  end_hour: string
  params: Record<string, string>
}
export interface WeatherData { times: string[]; hourly: Record<string, (number | null)[]>[] }

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'
const CHUNK = 100 // locations per request
const PARALLEL = 3

async function fetchChunk(req: WeatherRequest, pts: [number, number][]) {
  const q = new URLSearchParams({
    ...req.params,
    latitude: pts.map(p => p[0]).join(','),
    longitude: pts.map(p => p[1]).join(','),
    start_hour: req.start_hour,
    end_hour: req.end_hour,
  })
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${OPEN_METEO}?${q}`)
    if (r.ok) {
      const body = await r.json()
      return (Array.isArray(body) ? body : [body]).map((loc: { hourly: Record<string, unknown> }) => loc.hourly)
    }
    if (attempt < 2 && (r.status === 429 || r.status >= 500)) {
      await new Promise(res => setTimeout(res, 600 * 2 ** attempt))
      continue
    }
    const reason = (await r.json().catch(() => ({}))).reason
    throw new Error(r.status === 429
      ? 'The weather service limit is reached for your network. Try again later.'
      : `Weather service error ${r.status}${reason ? `: ${reason}` : ''}`)
  }
}

/** Run the forecast query; `keep` limits which variables are returned (smaller upload). */
export async function fetchWeather(req: WeatherRequest, keep?: string[]): Promise<WeatherData> {
  const chunks: [number, number][][] = []
  for (let i = 0; i < req.points.length; i += CHUNK) chunks.push(req.points.slice(i, i + CHUNK))
  const results: Record<string, unknown>[][] = new Array(chunks.length)
  for (let i = 0; i < chunks.length; i += PARALLEL) {
    await Promise.all(chunks.slice(i, i + PARALLEL).map(async (c, j) => { results[i + j] = await fetchChunk(req, c) }))
  }
  const all = results.flat()
  const times = (all[0]?.time as string[]) ?? []
  const hourly = all.map(h => {
    const out: Record<string, (number | null)[]> = {}
    for (const [k, v] of Object.entries(h)) if (k !== 'time' && (!keep || keep.includes(k))) out[k] = v as (number | null)[]
    return out
  })
  return { times, hourly }
}
