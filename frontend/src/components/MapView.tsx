import '../maplibre-setup'
import type * as GeoJSON from "geojson"
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, Marker, NavigationControl, Popup, Source } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre'
import type { ExpressionSpecification } from 'maplibre-gl'
import type { Checkpoint, Focus, Heatmap, Plan, Route, Stop } from '../types'
import { RISK_COLORS, fmtDuration, fmtTime } from '../risk'
import { levelExpression, type Metric } from '../metrics'
import { truckAt } from '../timeline'
import { CloudRain, Snowflake, Truck, Wind } from 'lucide-react'

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
// MapLibre uses 512 px tiles: metres per pixel at zoom 0 on the equator.
const M_PER_PX_Z0 = 40075016.686 / 512
const M_PER_MI = 1609.344
const ALL_METRICS: Metric[] = ['risk', 'wind_mph', 'rain_in_hr', 'snow_in_hr']

interface Props {
  plan: Plan | null; heatmap: Heatmap | null; hour: number; metric: Metric
  showHeatmap: boolean; selected: number | null; onSelectRoute: (id: number) => void
  focus: Focus | null; onFocus: (f: Focus | null) => void
}

type Hover = { kind: 'checkpoint'; route: number; idx: number } | { kind: 'stop'; route: number; idx: number }

/** Where to pin a route's label: spread along the line so the three labels do not stack. */
function labelPoint(r: Route): [number, number] {
  const c = r.geometry.coordinates
  const p = c[Math.floor((c.length - 1) * (0.3 + 0.2 * (r.id % 3)))]
  return [p[0], p[1]]
}

function CheckpointPopup({ cp, route }: { cp: Checkpoint; route: string }) {
  return (
    <div className="space-y-1 text-xs text-slate-700">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-slate-900">{route} · mile {cp.mile.toFixed(0)}</span>
        <span className="font-semibold" style={{ color: RISK_COLORS[cp.risk.level] }}>{cp.risk.label}</span>
      </div>
      <div>ETA <b>{fmtTime(cp.eta)}</b></div>
      <div className="flex items-center gap-1.5"><Wind size={12} className="text-slate-400" />{cp.weather.wind_mph} mph, gusts {cp.weather.gust_mph}</div>
      <div className="flex items-center gap-1.5"><CloudRain size={12} className="text-slate-400" />{cp.weather.rain_in_hr.toFixed(2)} in/hr rain</div>
      <div className="flex items-center gap-1.5"><Snowflake size={12} className="text-slate-400" />{cp.weather.snow_in_hr.toFixed(2)} in/hr snow</div>
      {cp.risk.factors.length > 0 && <div className="text-slate-500">Driven by: {cp.risk.factors.join(', ')}</div>}
    </div>
  )
}

function StopPopup({ stop, route }: { stop: Stop; route: string }) {
  return (
    <div className="space-y-1 text-xs text-slate-700">
      <div className="font-semibold text-slate-900">{route} · mile {stop.mile.toFixed(0)}</div>
      <div>{stop.kind === 'rest' ? '10-hour off-duty rest (11 h driving limit)' : '30-minute break (after 8 h driving)'}</div>
      <div>{fmtTime(stop.start)} → {fmtTime(stop.end)}</div>
    </div>
  )
}

export default function MapView({ plan, heatmap, hour, metric, showHeatmap, selected, onSelectRoute, focus, onFocus }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  const routesGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (plan?.routes ?? []).map(r => ({ type: 'Feature', geometry: r.geometry, properties: { id: r.id, color: r.color } })),
  }), [plan])

  const checkpointsGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (plan?.routes ?? []).flatMap(r => r.checkpoints.map((cp, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [cp.lon, cp.lat] },
      properties: { route: r.id, idx: i, level: cp.risk.level },
    }))),
  }), [plan])

  const stopsGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (plan?.routes ?? []).flatMap(r => r.stops.map((s, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      properties: { route: r.id, idx: i, rest: s.kind === 'rest' ? 1 : 0 },
    }))),
  }), [plan])

  // Every hour's value is a feature property, so moving the slider only changes a paint expression.
  const heatGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (heatmap?.points ?? []).map(([lon, lat], i) => {
      const props: Record<string, number> = {}
      ALL_METRICS.forEach(m => { heatmap![m].forEach((row, h) => { props[`${m}_${h}`] = row[i] }) })
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props }
    }),
  }), [heatmap])

  // Pixel radius at zoom 0 of one corridor disc (radius_mi on the ground); grows x2 per zoom level.
  const heatRadius0 = useMemo(() => {
    if (!heatmap?.points.length) return 0
    const lat = heatmap.points.reduce((a, p) => a + p[1], 0) / heatmap.points.length
    return (heatmap.radius_mi * M_PER_MI) / (M_PER_PX_Z0 * Math.cos((lat * Math.PI) / 180))
  }, [heatmap])

  useEffect(() => {
    if (!plan || !mapRef.current) return
    // Plain loop: Math.min(...hugeArray) can overflow the call stack on long routes.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const r of plan.routes) for (const [x, y] of r.geometry.coordinates) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    }
    if (Number.isFinite(x0)) mapRef.current.fitBounds([[x0, y0], [x1, y1]], { padding: { top: 60, left: 60, right: 60, bottom: 190 }, duration: 800 })
    setHover(null)
  }, [plan])

  useEffect(() => {
    if (!focus?.fly || !plan || !mapRef.current) return
    const cp = plan.routes.find(r => r.id === focus.route)?.checkpoints[focus.idx]
    if (cp) mapRef.current.easeTo({ center: [cp.lon, cp.lat], zoom: Math.max(mapRef.current.getZoom(), 6.5), duration: 600 })
  }, [focus, plan])

  // Colour = the risk band of the value at that point (same bands as checkpoints), worst drawn on top.
  const level = levelExpression(metric, hour)
  const heatColor: ExpressionSpecification = ['match', level, 0, RISK_COLORS[0], 1, RISK_COLORS[1], 2, RISK_COLORS[2], 3, RISK_COLORS[3], RISK_COLORS[4]]
  const heatOpacity: ExpressionSpecification = ['match', level, 0, 0.16, 0.42]

  const sel = selected ?? -1
  const onTop: ExpressionSpecification = ['case', ['==', ['get', 'id'], sel], 1, 0]

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f || !plan) { onFocus(null); return }
    if (f.layer.id === 'checkpoints') onFocus({ route: f.properties!.route, idx: f.properties!.idx })
    else if (f.layer.id === 'routes-hit') onSelectRoute(f.properties!.id)
  }
  const onMouseMove = (e: MapLayerMouseEvent) => {
    const f = e.features?.find(x => x.layer.id === 'checkpoints' || x.layer.id === 'stops')
    if (!f) { if (hover) setHover(null); return }
    const h: Hover = { kind: f.layer.id === 'stops' ? 'stop' : 'checkpoint', route: f.properties!.route, idx: f.properties!.idx }
    if (!hover || hover.kind !== h.kind || hover.route !== h.route || hover.idx !== h.idx) setHover(h)
  }

  // A pinned (clicked / list-selected) checkpoint wins over the hovered feature.
  const shown: Hover | null = focus ? { kind: 'checkpoint', ...focus } : hover
  let popup = null
  if (shown && plan) {
    const r = plan.routes.find(x => x.id === shown.route)
    const item = r && (shown.kind === 'stop' ? r.stops[shown.idx] : r.checkpoints[shown.idx])
    if (r && item) popup = (
      <Popup longitude={item.lon} latitude={item.lat} closeButton={!!focus} closeOnClick={false}
        onClose={() => onFocus(null)} maxWidth="260px" offset={10}>
        {shown.kind === 'stop' ? <StopPopup stop={item as Stop} route={r.name} /> : <CheckpointPopup cp={item as Checkpoint} route={r.name} />}
      </Popup>
    )
  }

  return (
    <Map ref={mapRef} initialViewState={{ longitude: -98, latitude: 38, zoom: 3.6 }} mapStyle={STYLE}
      interactiveLayerIds={['checkpoints', 'stops', 'routes-hit']} onClick={onClick} onMouseMove={onMouseMove}
      cursor={hover ? 'pointer' : 'auto'} style={{ width: '100%', height: '100%' }}>
      <NavigationControl position="top-right" />
      {heatmap && (
        <Source id="heat" type="geojson" data={heatGeo}>
          <Layer id="heat" type="circle" layout={{ visibility: showHeatmap ? 'visible' : 'none', 'circle-sort-key': level }} paint={{
            'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, heatRadius0, 22, heatRadius0 * 2 ** 22],
            'circle-color': heatColor,
            'circle-opacity': heatOpacity,
            'circle-blur': 0.7,
          }} />
        </Source>
      )}
      <Source id="routes" type="geojson" data={routesGeo}>
        <Layer id="routes-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': onTop }}
          paint={{ 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'id'], sel], 9, 6] }} />
        <Layer id="routes" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': onTop }}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'id'], sel], 6, 3.5],
            'line-opacity': ['case', ['==', ['get', 'id'], sel], 1, sel === -1 ? 0.9 : 0.45],
          }} />
        <Layer id="routes-hit" type="line" paint={{ 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 }} />
      </Source>
      <Source id="checkpoints" type="geojson" data={checkpointsGeo}>
        <Layer id="checkpoints" type="circle" layout={{ 'circle-sort-key': ['case', ['==', ['get', 'route'], sel], 1, 0] }} paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 7],
          'circle-color': ['match', ['get', 'level'], 0, RISK_COLORS[0], 1, RISK_COLORS[1], 2, RISK_COLORS[2], 3, RISK_COLORS[3], RISK_COLORS[4]],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['any', ['==', sel, -1], ['==', ['get', 'route'], sel]], 1, 0.35],
          'circle-stroke-opacity': ['case', ['any', ['==', sel, -1], ['==', ['get', 'route'], sel]], 1, 0.35],
        }} />
      </Source>
      <Source id="stops" type="geojson" data={stopsGeo}>
        <Layer id="stops" type="circle" paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'rest'], 1], 5, 4], 8, ['case', ['==', ['get', 'rest'], 1], 9, 7]],
          'circle-color': '#ffffff', 'circle-stroke-color': '#0f172a',
          'circle-stroke-width': ['case', ['==', ['get', 'rest'], 1], 3, 2],
          'circle-opacity': ['case', ['any', ['==', sel, -1], ['==', ['get', 'route'], sel]], 1, 0.3],
          'circle-stroke-opacity': ['case', ['any', ['==', sel, -1], ['==', ['get', 'route'], sel]], 1, 0.3],
        }} />
      </Source>
      {plan?.routes.map(r => (
        <Marker key={r.id} longitude={labelPoint(r)[0]} latitude={labelPoint(r)[1]} anchor="bottom" offset={[0, -6]}
          style={{ zIndex: r.id === sel ? 2 : 1 }}
          onClick={e => { e.originalEvent.stopPropagation(); onSelectRoute(r.id) }}>
          <button type="button" aria-label={`Select ${r.name}`}
            className={`whitespace-nowrap rounded border bg-white px-1.5 py-0.5 text-left text-[11px] leading-tight ${r.id === sel ? 'border-slate-900' : 'border-slate-300 opacity-80'}`}>
            <div className="flex items-center gap-1 font-semibold text-slate-900">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.name}{r.recommended && <span className="font-normal text-emerald-700">recommended</span>}
            </div>
            <div className="text-slate-600">
              {fmtDuration(r.trip_duration_s)} · Severe {r.summary.severe_miles.toFixed(0)} mi · High {r.summary.high_miles.toFixed(0)} mi
            </div>
          </button>
        </Marker>
      ))}
      {heatmap && plan?.routes.map(r => {
        const t = truckAt(r, heatmap.hours[hour])
        if (!t) return null
        const active = r.id === sel
        return (
          <Marker key={`truck${r.id}`} longitude={t.lon} latitude={t.lat} style={{ zIndex: active ? 4 : 3 }}>
            <div title={`${r.name} truck`} className={`flex items-center justify-center rounded-md border-2 border-white ${active ? 'h-7 w-7' : 'h-5 w-5 opacity-70'}`}
              style={{ background: r.color }}>
              <Truck size={active ? 15 : 11} color="white" />
            </div>
          </Marker>
        )
      })}
      {popup}
    </Map>
  )
}
