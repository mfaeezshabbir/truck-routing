import type * as GeoJSON from "geojson"
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, { Layer, NavigationControl, Popup, Source } from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre'
import type { Checkpoint, Heatmap, Plan } from '../types'
import { RISK_COLORS, fmtTime } from '../risk'

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
export type Metric = 'risk' | 'wind_mph' | 'rain_in_hr' | 'snow_in_hr'
const METRIC_MAX: Record<Metric, number> = { risk: 4, wind_mph: 55, rain_in_hr: 0.5, snow_in_hr: 2 }

interface Props {
  plan: Plan | null; heatmap: Heatmap | null; hour: number; metric: Metric
  showHeatmap: boolean; selected: number | null; onSelectRoute: (id: number) => void
}

export default function MapView({ plan, heatmap, hour, metric, showHeatmap, selected, onSelectRoute }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [popup, setPopup] = useState<{ cp: Checkpoint; route: string } | null>(null)

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

  // Built once per heatmap response: every hour's value is a property, so the slider only
  // changes a paint expression (no GeoJSON re-upload / re-tiling) -> smooth scrubbing.
  const heatGeo = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: 'FeatureCollection',
    features: (heatmap?.points ?? []).map(([lon, lat], i) => {
      const props: Record<string, number> = {}
      ;(['risk', 'wind_mph', 'rain_in_hr', 'snow_in_hr'] as Metric[]).forEach(m => {
        heatmap![m].forEach((row, h) => { props[`${m}_${h}`] = row[i] })
      })
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props }
    }),
  }), [heatmap])

  useEffect(() => {
    if (!plan || !mapRef.current) return
    const xs = plan.routes.flatMap(r => r.geometry.coordinates.map(c => c[0]))
    const ys = plan.routes.flatMap(r => r.geometry.coordinates.map(c => c[1]))
    mapRef.current.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, duration: 800 })
    setPopup(null)
  }, [plan])

  const key = `${metric}_${hour}`
  const weight: any = ['min', 1, ['/', ['coalesce', ['get', key], 0], METRIC_MAX[metric]]]

  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0]
    if (!f || !plan) return
    if (f.layer.id === 'checkpoints') {
      const r = plan.routes.find(x => x.id === f.properties!.route)!
      setPopup({ cp: r.checkpoints[f.properties!.idx], route: r.name })
    } else if (f.layer.id === 'routes-hit') {
      onSelectRoute(f.properties!.id)
    }
  }

  const sel = selected ?? -1
  return (
    <Map ref={mapRef} initialViewState={{ longitude: -98, latitude: 38, zoom: 3.6 }} mapStyle={STYLE}
      interactiveLayerIds={['checkpoints', 'routes-hit']} onClick={onClick}
      cursor="auto" style={{ width: '100%', height: '100%' }}>
      <NavigationControl position="top-right" />
      {heatmap && (
        <Source id="heat" type="geojson" data={heatGeo}>
          <Layer id="heat" type="heatmap" layout={{ visibility: showHeatmap ? 'visible' : 'none' }} paint={{
            'heatmap-weight': weight,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 0.9, 8, 1.6],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 22, 6, 55, 9, 120],
            'heatmap-opacity': 0.65,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)', 0.1, 'rgba(22,163,74,0.35)', 0.3, '#eab308', 0.55, '#f97316', 0.8, '#dc2626', 1, '#7e22ce'],
          }} />
        </Source>
      )}
      <Source id="routes" type="geojson" data={routesGeo}>
        <Layer id="routes-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': '#ffffff', 'line-width': ['case', ['==', ['get', 'id'], sel], 9, 6] }} />
        <Layer id="routes" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'id'], sel], 6, 3.5],
            'line-opacity': ['case', ['==', ['get', 'id'], sel], 1, sel === -1 ? 0.9 : 0.45],
          }} />
        <Layer id="routes-hit" type="line" paint={{ 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 }} />
      </Source>
      <Source id="checkpoints" type="geojson" data={checkpointsGeo}>
        <Layer id="checkpoints" type="circle" paint={{
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3.5, 8, 7],
          'circle-color': ['match', ['get', 'level'], 0, RISK_COLORS[0], 1, RISK_COLORS[1], 2, RISK_COLORS[2], 3, RISK_COLORS[3], RISK_COLORS[4]],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
          'circle-opacity': ['case', ['any', ['==', sel, -1], ['==', ['get', 'route'], sel]], 1, 0.35],
        }} />
      </Source>
      {popup && (
        <Popup longitude={popup.cp.lon} latitude={popup.cp.lat} onClose={() => setPopup(null)} closeOnClick={false} maxWidth="260px">
          <div className="space-y-1 text-xs text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-900">{popup.route} · mile {popup.cp.mile.toFixed(0)}</span>
              <span className="rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: RISK_COLORS[popup.cp.risk.level] }}>{popup.cp.risk.label}</span>
            </div>
            <div>ETA <b>{fmtTime(popup.cp.eta)}</b></div>
            <div>Wind <b>{popup.cp.weather.wind_mph} mph</b> (gust {popup.cp.weather.gust_mph})</div>
            <div>Rain <b>{popup.cp.weather.rain_in_hr.toFixed(2)} in/hr</b> · Snow <b>{popup.cp.weather.snow_in_hr.toFixed(2)} in/hr</b></div>
            {popup.cp.risk.factors.length > 0 && <div className="text-slate-500">Driven by: {popup.cp.risk.factors.join(', ')}</div>}
          </div>
        </Popup>
      )}
    </Map>
  )
}
