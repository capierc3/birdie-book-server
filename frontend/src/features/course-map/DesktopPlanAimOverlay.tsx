import { useEffect, useMemo, useRef, useState } from 'react'
import { Source, Layer, Marker, useMap } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, LineString, Polygon, Position } from 'geojson'
import type { MapMouseEvent } from 'maplibre-gl'
import { useCourseMap } from './courseMapState'
import type { LatLng } from './courseMapState'
import { haversineYards, bearing, destPoint, normalCDF } from './geoUtils'
import { getClubColor } from './clubColors'

/**
 * DesktopPlanAimOverlay — Stage 20g live cursor-following aim cone.
 *
 * When `ctx.planAiming` is set (PlanningPanel "Place Shot" pressed), enters
 * aiming mode: cursor becomes crosshair, map drag is disabled, a live
 * dispersion cone follows the mouse from the ball position. Click commits
 * the aim and dispatches `plan-aim-complete`; Escape cancels and dispatches
 * `plan-aim-cancel`.
 */

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function DesktopPlanAimOverlay() {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap()
  const ctx = useCourseMap()
  const aiming = ctx.planAiming

  const [cursor, setCursor] = useState<LatLng | null>(null)
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx

  // Pull club stats for the active aim
  const cd = useMemo(() => {
    if (!aiming) return null
    const player = ctxRef.current.strategy?.player
    const c = player?.clubs?.find(cl => cl.club_type === aiming.club)
    if (!c) return null
    const lat = player?.lateral_dispersion?.[aiming.club]
    return {
      color: c.color || getClubColor(aiming.club),
      avg: c.avg_yards,
      std: c.std_dev || c.avg_yards * 0.08,
      p10: c.p10 || c.avg_yards * 0.88,
      p90: c.p90 || c.avg_yards * 1.12,
      lateralStd: Math.min(lat?.lateral_std_dev || ((c.std_dev || 0) * 0.15) || 8, c.avg_yards * 0.12),
    }
  }, [aiming])

  // Wire map handlers while aiming
  useEffect(() => {
    if (!map || !aiming || !cd || cd.avg <= 0) return
    const container = map.getContainer()

    const onMove = (e: MapMouseEvent) => {
      setCursor({ lat: e.lngLat.lat, lng: e.lngLat.lng })
    }
    const onClick = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      window.dispatchEvent(new CustomEvent('plan-aim-complete', {
        detail: { lat: e.lngLat.lat, lng: e.lngLat.lng },
      }))
      ctxRef.current.setPlanAiming(null)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('plan-aim-cancel'))
        ctxRef.current.setPlanAiming(null)
      }
    }

    container.style.cursor = 'crosshair'
    map.dragPan.disable()
    map.on('mousemove', onMove)
    map.on('click', onClick)
    document.addEventListener('keydown', onEsc)

    return () => {
      map.off('mousemove', onMove)
      map.off('click', onClick)
      document.removeEventListener('keydown', onEsc)
      map.dragPan.enable()
      container.style.cursor = ''
      setCursor(null)
    }
  }, [map, aiming, cd])

  const coneFC = useMemo<FeatureCollection>(() => {
    if (!aiming || !cd || !cursor) return EMPTY_FC
    const origin = aiming.ballPos
    const aimBearing = bearing(origin.lat, origin.lng, cursor.lat, cursor.lng)
    const spreadInner = Math.atan2(cd.lateralStd, cd.avg)
    const spreadOuter = Math.atan2(cd.lateralStd * 2, cd.avg)
    const steps = 20
    const features: Feature<Polygon | LineString>[] = []

    // Outer cone
    const outer: Position[] = [[origin.lng, origin.lat]]
    for (let i = 0; i <= steps; i++) {
      const angle = aimBearing - spreadOuter + (i / steps) * spreadOuter * 2
      const pt = destPoint(origin.lat, origin.lng, angle, cd.p90)
      outer.push([pt.lng, pt.lat])
    }
    outer.push([origin.lng, origin.lat])
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [outer] },
      properties: { color: cd.color, kind: 'outer' },
    })

    // Inner cone
    const inner: Position[] = [[origin.lng, origin.lat]]
    for (let i = 0; i <= steps; i++) {
      const angle = aimBearing - spreadInner + (i / steps) * spreadInner * 2
      const pt = destPoint(origin.lat, origin.lng, angle, cd.avg)
      inner.push([pt.lng, pt.lat])
    }
    inner.push([origin.lng, origin.lat])
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [inner] },
      properties: { color: cd.color, kind: 'inner' },
    })

    // Aim line at avg distance along bearing
    const aimPt = destPoint(origin.lat, origin.lng, aimBearing, cd.avg)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [aimPt.lng, aimPt.lat]] },
      properties: { color: '#fff', kind: 'aim' },
    })

    return { type: 'FeatureCollection', features }
  }, [aiming, cd, cursor])

  // Distance + probability label at cursor
  const cursorLabel = useMemo(() => {
    if (!aiming || !cd || !cursor) return null
    const origin = aiming.ballPos
    const dist = Math.round(haversineYards(origin.lat, origin.lng, cursor.lat, cursor.lng))

    // Shot probability — same formula as Leaflet implementation
    const acceptRadius = Math.max(8, Math.round(cd.avg * 0.12))
    const zLow = (dist - acceptRadius - cd.avg) / cd.std
    const zHigh = (dist + acceptRadius - cd.avg) / cd.std
    const pDist = normalCDF(zHigh) - normalCDF(zLow)
    const latStd = cd.lateralStd || cd.std * 0.15
    const pLat = normalCDF(acceptRadius / latStd) - normalCDF(-acceptRadius / latStd)
    const prob = Math.round(Math.max(0.02, Math.min(0.99, Math.sqrt(pDist * pLat))) * 100)
    const probColor = prob >= 60 ? '#4caf50' : prob >= 30 ? '#ff9800' : '#ef4444'

    return { lat: cursor.lat, lng: cursor.lng, dist, prob, probColor }
  }, [aiming, cd, cursor])

  if (!aiming || !cd) return null

  return (
    <>
      <Source id="d-planaim-cone" type="geojson" data={coneFC}>
        <Layer
          id="d-planaim-cone-outer-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 }}
        />
        <Layer
          id="d-planaim-cone-outer-line"
          type="line"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.4 }}
        />
        <Layer
          id="d-planaim-cone-inner-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 }}
        />
        <Layer
          id="d-planaim-cone-inner-line"
          type="line"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.4 }}
        />
        <Layer
          id="d-planaim-cone-aim"
          type="line"
          filter={['==', ['get', 'kind'], 'aim']}
          paint={{ 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }}
        />
      </Source>

      {cursorLabel && (
        <Marker longitude={cursorLabel.lng} latitude={cursorLabel.lat} anchor="bottom" offset={[16, -14]}>
          <div
            style={{
              background: 'rgba(0,0,0,0.85)', color: '#fff',
              padding: '4px 10px', borderRadius: 5,
              fontSize: 12, fontWeight: 700,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {cursorLabel.dist}y <span style={{ color: cursorLabel.probColor }}>{cursorLabel.prob}%</span>
          </div>
        </Marker>
      )}
    </>
  )
}
