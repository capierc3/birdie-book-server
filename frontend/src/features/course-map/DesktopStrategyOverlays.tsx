import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Source, Layer, Marker, useMap } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, LineString, Polygon, Position } from 'geojson'
import type { MapMouseEvent } from 'maplibre-gl'
import { useCourseMap } from './courseMapState'
import type { LatLng } from './courseMapState'
import { haversineYards, bearing, destPoint } from './geoUtils'
import { getClubStats, rankClubs, computeCarryProbabilities } from './caddieCalc'
import type { ClubStats } from './caddieCalc'
import type { StrategyTool } from './StrategyToolsPanel'

/**
 * DesktopStrategyOverlays — Stage 20g strategy tools (MapLibre).
 *
 * Tools:
 *   - placeball   : click to set ballPos (marker rendered by DesktopMapLibreOverlays)
 *   - ruler       : mousedown → drag → mouseup; live distance label
 *   - cone        : mousedown → drag (aim) → mouseup; live cone for selected club
 *   - landing     : click → arc band around target for selected club
 *   - carry       : click → red distance marker + lines + carry%s in panel
 *   - recommend   : click → blue distance marker + lines + ranked clubs in panel
 *
 * Reads selected club from `#strategy-club-select` in the panel and writes
 * results to `#strategy-results-content`. The DOM-side hack matches the
 * Leaflet implementation; not worth refactoring while migrating.
 */

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function DesktopStrategyOverlays({ visible }: { visible: boolean }) {
  const { current: mapRef } = useMap()
  const map = mapRef?.getMap()
  const ctx = useCourseMap()
  const { drawPanelOpen, activeTool: drawActiveTool } = ctx
  const tool = ctx.activeStrategyTool as StrategyTool

  // ── Stable refs so map listeners always read the latest state ──
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const toolRef = useRef(tool)
  toolRef.current = tool
  const drawingActive = drawPanelOpen && !!drawActiveTool

  // ── Persistent overlay state ──
  // Live ruler line during drag
  const [rulerLine, setRulerLine] = useState<{ a: LatLng; b: LatLng; yards: number } | null>(null)
  // Persistent cone after drag release (sticky until tool change)
  const [persistentCone, setPersistentCone] = useState<{ origin: LatLng; aim: LatLng; club: ClubStats } | null>(null)
  // Persistent landing zone after click
  const [persistentLanding, setPersistentLanding] = useState<{ click: LatLng; club: ClubStats } | null>(null)
  // Persistent carry marker
  const [carryMarker, setCarryMarker] = useState<{ from: LatLng; click: LatLng; dist: number } | null>(null)
  // Persistent recommend marker
  const [recommendMarker, setRecommendMarker] = useState<{ from: LatLng; click: LatLng; dist: number } | null>(null)

  const dragRef = useRef<{ origin: LatLng | null }>({ origin: null })

  // Helper: read currently selected club from the panel's <select>
  const getCurrentClubStats = useCallback((): ClubStats | null => {
    const select = document.getElementById('strategy-club-select') as HTMLSelectElement | null
    if (!select) return null
    const clubType = select.value
    const player = ctxRef.current.strategy?.player
    const club = player?.clubs?.find(cl => cl.club_type === clubType)
    if (!club) return null
    return getClubStats(club, player?.lateral_dispersion?.[clubType], player?.miss_tendencies?.[clubType])
  }, [])

  // Clear sticky overlays + DOM results when the tool changes or visibility flips
  useEffect(() => {
    setRulerLine(null)
    setPersistentCone(null)
    setPersistentLanding(null)
    setCarryMarker(null)
    setRecommendMarker(null)
    const resultsSection = document.getElementById('strategy-results-section')
    if (resultsSection) resultsSection.style.display = 'none'
  }, [tool, visible])

  // ── Map mouse handlers (registered when panel is visible) ──
  useEffect(() => {
    if (!map || !visible) return

    // Cursor hint based on current tool
    const container = map.getContainer()
    const setCursor = () => {
      if (drawingActive) {
        container.style.cursor = 'crosshair'
        return
      }
      if (toolRef.current === 'ruler' || toolRef.current === 'cone') container.style.cursor = 'crosshair'
      else container.style.cursor = 'pointer'
    }
    setCursor()

    const onMouseDown = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      // Drawing tools take precedence — don't intercept their clicks
      if (ctxRef.current.drawPanelOpen && ctxRef.current.activeTool) return
      const t = toolRef.current
      if (t !== 'ruler' && t !== 'cone') return
      dragRef.current.origin = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      map.dragPan.disable()
      if (t === 'ruler') {
        setRulerLine({ a: dragRef.current.origin!, b: dragRef.current.origin!, yards: 0 })
      } else if (t === 'cone') {
        setPersistentCone(null)
      }
    }

    const onMouseMove = (e: MapMouseEvent) => {
      const origin = dragRef.current.origin
      if (!origin) return
      const t = toolRef.current
      const here = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (t === 'ruler') {
        setRulerLine({
          a: origin,
          b: here,
          yards: Math.round(haversineYards(origin.lat, origin.lng, here.lat, here.lng)),
        })
      } else if (t === 'cone') {
        const club = getCurrentClubStats()
        if (club) {
          setPersistentCone({ origin, aim: here, club })
        }
      }
    }

    const onMouseUp = () => {
      if (!dragRef.current.origin) return
      const t = toolRef.current
      dragRef.current.origin = null
      map.dragPan.enable()
      if (t === 'ruler') {
        // Original Leaflet impl clears ruler on release. Match that.
        setRulerLine(null)
      }
      // Cone stays visible after release (sticky)
    }

    const onClick = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      // Drawing tools take precedence
      if (ctxRef.current.drawPanelOpen && ctxRef.current.activeTool) return
      const t = toolRef.current
      const here = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      const c = ctxRef.current

      if (t === 'placeball') {
        c.setBallPos(here)
        c.triggerRedraw()
        return
      }

      const club = getCurrentClubStats()
      if (t === 'landing') {
        if (club) setPersistentLanding({ click: here, club })
      } else if (t === 'carry') {
        const from = c.ballPos ?? c.teePos ?? here
        const dist = Math.round(haversineYards(from.lat, from.lng, here.lat, here.lng))
        setCarryMarker({ from, click: here, dist })
        // Write carry probabilities into the panel via DOM
        const clubs = c.strategy?.player?.clubs || []
        const rows = computeCarryProbabilities(clubs, dist)
        const resultsSection = document.getElementById('strategy-results-section')
        const resultsContent = document.getElementById('strategy-results-content')
        if (resultsSection && resultsContent) {
          resultsSection.style.display = ''
          let html = `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">Distance: <strong style="color:var(--text);">${dist}y</strong></div>`
          if (rows.length === 0) {
            html += '<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">No clubs with enough data</div>'
          } else {
            for (const r of rows.slice(0, 8)) {
              const color = r.pct >= 80 ? 'var(--accent)' : r.pct >= 50 ? 'var(--warning, #ff9800)' : 'var(--danger)'
              html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;"><span>${r.type} (${Math.round(r.avg)}y)</span><span style="color:${color};font-weight:700;">${r.pct}%</span></div>`
            }
          }
          resultsContent.innerHTML = html
        }
      } else if (t === 'recommend') {
        const from = c.ballPos ?? c.teePos ?? here
        const dist = Math.round(haversineYards(from.lat, from.lng, here.lat, here.lng))
        setRecommendMarker({ from, click: here, dist })
        const clubs = c.strategy?.player?.clubs || []
        const ranked = rankClubs(clubs, dist, { count: 10 })
        const resultsSection = document.getElementById('strategy-results-section')
        const resultsContent = document.getElementById('strategy-results-content')
        if (resultsSection && resultsContent) {
          resultsSection.style.display = ''
          let html = `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">Target: <strong style="color:var(--text);">${dist}y</strong></div>`
          if (ranked.length === 0) {
            html += '<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">No clubs with data</div>'
          } else {
            for (const r of ranked.slice(0, 5)) {
              const sign = r.avg > dist ? '+' : ''
              const color = r.matchPct >= 75 ? 'var(--accent)' : r.matchPct >= 40 ? 'var(--warning, #ff9800)' : 'var(--text-dim)'
              html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;"><span>${r.type} (${Math.round(r.avg)}y)</span><span style="color:${color};font-weight:600;">${sign}${Math.round(r.avg - dist)}y</span></div>`
            }
          }
          resultsContent.innerHTML = html
        }
      }
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    map.on('click', onClick)

    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      map.off('click', onClick)
      map.dragPan.enable()
      container.style.cursor = ''
    }
  }, [map, visible, drawingActive, getCurrentClubStats])

  // ── Render persistent overlay GeoJSON ──
  const rulerFC = useMemo<FeatureCollection>(() => {
    if (!rulerLine) return EMPTY_FC
    const { a, b } = rulerLine
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
        properties: {},
      }],
    }
  }, [rulerLine])

  const coneFC = useMemo<FeatureCollection>(() => {
    if (!persistentCone) return EMPTY_FC
    const { origin, aim, club } = persistentCone
    const aimBearing = bearing(origin.lat, origin.lng, aim.lat, aim.lng)
    const spreadInner = Math.atan2(club.lateralStd, club.avg)
    const spreadOuter = Math.atan2(club.lateralStd * 2, club.avg)
    const biasAngle = ((club.missRight - club.missLeft) / 100) * spreadOuter * 0.5
    const coneBearing = aimBearing + biasAngle
    const steps = 20
    const features: Feature<Polygon | LineString>[] = []

    // Outer cone (±2σ, p90)
    const outer: Position[] = [[origin.lng, origin.lat]]
    for (let i = 0; i <= steps; i++) {
      const angle = coneBearing - spreadOuter + (i / steps) * spreadOuter * 2
      const pt = destPoint(origin.lat, origin.lng, angle, club.p90)
      outer.push([pt.lng, pt.lat])
    }
    outer.push([origin.lng, origin.lat])
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [outer] },
      properties: { color: club.color, kind: 'outer' },
    })

    // Inner cone (±1σ, avg)
    const inner: Position[] = [[origin.lng, origin.lat]]
    for (let i = 0; i <= steps; i++) {
      const angle = coneBearing - spreadInner + (i / steps) * spreadInner * 2
      const pt = destPoint(origin.lat, origin.lng, angle, club.avg)
      inner.push([pt.lng, pt.lat])
    }
    inner.push([origin.lng, origin.lat])
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [inner] },
      properties: { color: club.color, kind: 'inner' },
    })

    // Aim line
    const aimPt = destPoint(origin.lat, origin.lng, aimBearing, club.avg)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [aimPt.lng, aimPt.lat]] },
      properties: { color: '#fff', kind: 'aim' },
    })

    return { type: 'FeatureCollection', features }
  }, [persistentCone])

  const landingFC = useMemo<FeatureCollection>(() => {
    if (!persistentLanding) return EMPTY_FC
    const { click, club } = persistentLanding
    const c = ctxRef.current
    let aimBear = 0
    if (c.greenPos) aimBear = bearing(click.lat, click.lng, c.greenPos.lat, c.greenPos.lng)
    else if (c.teePos) aimBear = bearing(c.teePos.lat, c.teePos.lng, click.lat, click.lng)

    const steps = 24
    const arcCoords = (dist: number): Position[] => {
      const pts: Position[] = []
      for (let i = 0; i <= steps; i++) {
        const angle = aimBear - Math.PI / 2 + (i / steps) * Math.PI
        const pt = destPoint(click.lat, click.lng, angle, dist)
        pts.push([pt.lng, pt.lat])
      }
      return pts
    }

    const features: Feature<Polygon | LineString>[] = []
    // Outer band (p10..p90)
    const outerArc = arcCoords(club.p90)
    const innerArcRev = [...arcCoords(club.p10)].reverse()
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...outerArc, ...innerArcRev, outerArc[0]]] },
      properties: { color: club.color, kind: 'outerBand' },
    })
    // Inner band (avg ± 0.5σ)
    const innerNear = arcCoords(Math.max(club.avg - club.std * 0.5, club.p10))
    const innerFarRev = [...arcCoords(club.avg + club.std * 0.5)].reverse()
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...innerFarRev, ...innerNear, innerFarRev[0]]] },
      properties: { color: club.color, kind: 'innerBand' },
    })
    // Avg arc (dashed)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: arcCoords(club.avg) },
      properties: { color: club.color, kind: 'avgArc' },
    })

    return { type: 'FeatureCollection', features }
  }, [persistentLanding])

  const carryRecommendFC = useMemo<FeatureCollection>(() => {
    const features: Feature<LineString>[] = []
    if (carryMarker) {
      const { from, click } = carryMarker
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [click.lng, click.lat]] },
        properties: { color: '#f44336' },
      })
    }
    if (recommendMarker) {
      const { from, click } = recommendMarker
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [click.lng, click.lat]] },
        properties: { color: '#2196F3' },
      })
    }
    return { type: 'FeatureCollection', features }
  }, [carryMarker, recommendMarker])

  if (!visible) return null

  return (
    <>
      {/* Cone */}
      <Source id="d-strat-cone" type="geojson" data={coneFC}>
        <Layer
          id="d-strat-cone-outer-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.1 }}
        />
        <Layer
          id="d-strat-cone-outer-line"
          type="line"
          filter={['==', ['get', 'kind'], 'outer']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.5 }}
        />
        <Layer
          id="d-strat-cone-inner-fill"
          type="fill"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 }}
        />
        <Layer
          id="d-strat-cone-inner-line"
          type="line"
          filter={['==', ['get', 'kind'], 'inner']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.5 }}
        />
        <Layer
          id="d-strat-cone-aim"
          type="line"
          filter={['==', ['get', 'kind'], 'aim']}
          paint={{ 'line-color': '#fff', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }}
        />
      </Source>

      {/* Landing zone */}
      <Source id="d-strat-landing" type="geojson" data={landingFC}>
        <Layer
          id="d-strat-landing-outer"
          type="fill"
          filter={['==', ['get', 'kind'], 'outerBand']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 }}
        />
        <Layer
          id="d-strat-landing-inner"
          type="fill"
          filter={['==', ['get', 'kind'], 'innerBand']}
          paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }}
        />
        <Layer
          id="d-strat-landing-avg"
          type="line"
          filter={['==', ['get', 'kind'], 'avgArc']}
          paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] }}
        />
      </Source>

      {/* Ruler line */}
      <Source id="d-strat-ruler" type="geojson" data={rulerFC}>
        <Layer
          id="d-strat-ruler-line"
          type="line"
          paint={{ 'line-color': '#FF5722', 'line-width': 2.5 }}
        />
      </Source>
      {rulerLine && (
        <RulerLabel pos={rulerLine.b} yards={rulerLine.yards} />
      )}

      {/* Carry / recommend connector lines */}
      <Source id="d-strat-carry-recommend" type="geojson" data={carryRecommendFC}>
        <Layer
          id="d-strat-carry-recommend-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 1.5,
            'line-dasharray': [2, 2],
          }}
        />
      </Source>
      {carryMarker && (
        <ClickMarker pos={carryMarker.click} color="#f44336" label={`${carryMarker.dist}y`} />
      )}
      {recommendMarker && (
        <ClickMarker pos={recommendMarker.click} color="#2196F3" label={`${recommendMarker.dist}y`} />
      )}
    </>
  )
}

// ── Tiny presentational helpers (HTML markers via react-map-gl) ──

function RulerLabel({ pos, yards }: { pos: LatLng; yards: number }) {
  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom" offset={[16, -14]}>
      <div
        style={{
          background: 'rgba(255,87,34,0.92)', color: '#fff',
          padding: '5px 12px', borderRadius: 5,
          fontSize: 14, fontWeight: 700,
          whiteSpace: 'nowrap', lineHeight: 1,
          pointerEvents: 'none',
        }}
      >{yards}y</div>
    </Marker>
  )
}

function ClickMarker({ pos, color, label }: { pos: LatLng; color: string; label: string }) {
  return (
    <>
      <Marker longitude={pos.lng} latitude={pos.lat} anchor="center">
        <div
          style={{
            width: 12, height: 12, borderRadius: '50%',
            background: color, border: '2px solid #fff',
            opacity: 0.85,
            pointerEvents: 'none',
          }}
        />
      </Marker>
      <Marker longitude={pos.lng} latitude={pos.lat} anchor="bottom" offset={[0, -10]}>
        <div
          style={{
            background: `${color}e6`, color: '#fff',
            padding: '3px 8px', borderRadius: 4,
            fontSize: 12, fontWeight: 700,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >{label}</div>
      </Marker>
    </>
  )
}
