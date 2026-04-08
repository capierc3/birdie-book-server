import { useEffect, useRef, useCallback } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useCourseMap } from './courseMapState'
import { haversineYards, destPoint, bearing, normalCDF } from './geoUtils'
import type { StrategyTool } from './StrategyToolsPanel'

interface ClubData {
  type: string; color: string; avg: number; std: number
  p10: number; p90: number; lateralStd: number; lateralMean: number
  missLeft: number; missRight: number; missCenter: number
}

/**
 * StrategyOverlays: Renders strategy tool overlays on the Leaflet map.
 * Headless component inside <MapContainer>.
 */
export function StrategyOverlays({ visible, activeTool }: { visible: boolean; activeTool: StrategyTool }) {
  const map = useMap()
  const ctx = useCourseMap()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const toolRef = useRef(activeTool)
  toolRef.current = activeTool

  const layerRef = useRef<L.LayerGroup>(L.layerGroup())
  const ballMarkerRef = useRef<L.CircleMarker | null>(null)
  const draggingRef = useRef(false)
  const originRef = useRef<{ lat: number; lng: number } | null>(null)
  const rulerRef = useRef<{ line: L.Polyline | null; label: L.Marker | null; origin: L.CircleMarker | null; cursor: L.Marker | null }>({ line: null, label: null, origin: null, cursor: null })
  // Results are rendered via DOM manipulation into #strategy-results-content

  const getClubData = useCallback((): ClubData | null => {
    const select = document.getElementById('strategy-club-select') as HTMLSelectElement | null
    if (!select) return null
    const clubType = select.value
    const c = ctxRef.current.strategy?.player
    const club = c?.clubs?.find((cl) => cl.club_type === clubType)
    if (!club) return null
    const lat = c?.lateral_dispersion?.[clubType]
    const miss = c?.miss_tendencies?.[clubType]
    return {
      type: clubType,
      color: club.color || '#4CAF50',
      avg: club.avg_yards,
      std: club.std_dev || club.avg_yards * 0.08,
      p10: club.p10 || club.avg_yards * 0.88,
      p90: club.p90 || club.avg_yards * 1.12,
      lateralStd: Math.min(lat?.lateral_std_dev || ((club.std_dev || 0) * 0.15) || 8, club.avg_yards * 0.12),
      lateralMean: lat?.lateral_mean || 0,
      missLeft: miss?.left_pct || 33,
      missRight: miss?.right_pct || 33,
      missCenter: miss?.center_pct || 34,
    }
  }, [])

  // Add/remove layer group
  useEffect(() => {
    const lg = layerRef.current
    if (visible && !map.hasLayer(lg)) lg.addTo(map)
    if (!visible) {
      lg.clearLayers()
      ballMarkerRef.current = null
      if (map.hasLayer(lg)) map.removeLayer(lg)
      map.dragging.enable()
      map.getContainer().style.cursor = ''
    }
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map, visible])

  // Clear overlays and update cursor when tool changes
  useEffect(() => {
    if (!visible) return
    // Clear all layers except ball marker when switching tools
    const lg = layerRef.current
    lg.eachLayer((l) => { if (l !== ballMarkerRef.current) lg.removeLayer(l) })
    // Hide results
    const resultsSection = document.getElementById('strategy-results-section')
    if (resultsSection) resultsSection.style.display = 'none'
    // Reset drag state
    draggingRef.current = false
    map.dragging.enable()
    map.getContainer().style.cursor = (activeTool === 'ruler' || activeTool === 'cone') ? 'crosshair' : 'pointer'
  }, [map, visible, activeTool])

  // ── Drawing functions ──
  const drawCone = useCallback((originLat: number, originLng: number, aimBearing: number, club: ClubData) => {
    const lg = layerRef.current
    lg.eachLayer((l) => { if (l !== ballMarkerRef.current) lg.removeLayer(l) })

    const spreadInner = Math.atan2(club.lateralStd, club.avg)
    const spreadOuter = Math.atan2(club.lateralStd * 2, club.avg)
    const biasAngle = ((club.missRight - club.missLeft) / 100) * spreadOuter * 0.5
    const coneBearing = aimBearing + biasAngle
    const steps = 20

    // Outer cone (±2σ, p90)
    const outerPts: [number, number][] = [[originLat, originLng]]
    for (let i = 0; i <= steps; i++) {
      const angle = coneBearing - spreadOuter + (i / steps) * spreadOuter * 2
      const pt = destPoint(originLat, originLng, angle, club.p90)
      outerPts.push([pt.lat, pt.lng])
    }
    L.polygon(outerPts, { color: club.color, weight: 1, fillColor: club.color, fillOpacity: 0.1, interactive: false }).addTo(lg)

    // Inner cone (±1σ, avg)
    const innerPts: [number, number][] = [[originLat, originLng]]
    for (let i = 0; i <= steps; i++) {
      const angle = coneBearing - spreadInner + (i / steps) * spreadInner * 2
      const pt = destPoint(originLat, originLng, angle, club.avg)
      innerPts.push([pt.lat, pt.lng])
    }
    L.polygon(innerPts, { color: club.color, weight: 1, fillColor: club.color, fillOpacity: 0.18, interactive: false }).addTo(lg)

    // Aim line (white dashed)
    const aimPt = destPoint(originLat, originLng, aimBearing, club.avg)
    L.polyline([[originLat, originLng], [aimPt.lat, aimPt.lng]], { color: '#fff', weight: 1.5, dashArray: '6,4', interactive: false, opacity: 0.7 }).addTo(lg)

    // Label
    const labelPt = destPoint(originLat, originLng, coneBearing, club.avg)
    L.marker([labelPt.lat, labelPt.lng], {
      icon: L.divIcon({ className: '', html: `<div style="display:inline-block;background:rgba(0,0,0,0.8);color:${club.color};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${club.type} ${Math.round(club.avg)}y</div>`, iconSize: [0, 0] }),
      interactive: false,
    }).addTo(lg)

    // Origin dot
    L.circleMarker([originLat, originLng], { radius: 4, color: club.color, fillColor: club.color, fillOpacity: 1, interactive: false }).addTo(lg)
  }, [])

  const drawLandingZone = useCallback((clickLat: number, clickLng: number, club: ClubData) => {
    const lg = layerRef.current
    lg.eachLayer((l) => { if (l !== ballMarkerRef.current) lg.removeLayer(l) })

    const c = ctxRef.current
    let aimBear = 0
    if (c.greenPos) aimBear = bearing(clickLat, clickLng, c.greenPos.lat, c.greenPos.lng)
    else if (c.teePos) aimBear = bearing(c.teePos.lat, c.teePos.lng, clickLat, clickLng)

    const steps = 24
    const arcPoints = (dist: number) => {
      const pts: [number, number][] = []
      for (let i = 0; i <= steps; i++) {
        const angle = aimBear - Math.PI / 2 + (i / steps) * Math.PI
        const pt = destPoint(clickLat, clickLng, angle, dist)
        pts.push([pt.lat, pt.lng])
      }
      return pts
    }

    // Outer band
    const outerArc = arcPoints(club.p90)
    const innerArcRev = arcPoints(club.p10).reverse()
    L.polygon([...outerArc, ...innerArcRev], { color: club.color, weight: 1, fillColor: club.color, fillOpacity: 0.08, interactive: false }).addTo(lg)

    // Inner band
    const innerNear = arcPoints(Math.max(club.avg - club.std * 0.5, club.p10))
    const innerFarRev = arcPoints(club.avg + club.std * 0.5).reverse()
    L.polygon([...innerFarRev, ...innerNear], { color: club.color, weight: 1, fillColor: club.color, fillOpacity: 0.15, interactive: false }).addTo(lg)

    // Avg arc (dashed)
    L.polyline(arcPoints(club.avg), { color: club.color, weight: 2, dashArray: '6,4', interactive: false }).addTo(lg)
    L.polyline(arcPoints(club.p10), { color: club.color, weight: 1, opacity: 0.4, interactive: false }).addTo(lg)
    L.polyline(outerArc, { color: club.color, weight: 1, opacity: 0.4, interactive: false }).addTo(lg)

    // Label + origin
    const labelPt = destPoint(clickLat, clickLng, aimBear, club.avg)
    L.marker([labelPt.lat, labelPt.lng], {
      icon: L.divIcon({ className: '', html: `<div style="display:inline-block;background:rgba(0,0,0,0.8);color:${club.color};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${club.type} ${Math.round(club.p10)}-${Math.round(club.p90)}y</div>`, iconSize: [0, 0] }),
      interactive: false,
    }).addTo(lg)
    L.circleMarker([clickLat, clickLng], { radius: 4, color: '#fff', fillColor: club.color, fillOpacity: 1, weight: 2, interactive: false }).addTo(lg)
  }, [])

  const doCarryCheck = useCallback((clickLat: number, clickLng: number) => {
    const lg = layerRef.current
    lg.clearLayers()
    if (!map.hasLayer(lg)) lg.addTo(map)

    const c = ctxRef.current
    const from = c.ballPos || c.teePos
    const fromLat = from?.lat || clickLat
    const fromLng = from?.lng || clickLng
    const targetDist = Math.round(haversineYards(fromLat, fromLng, clickLat, clickLng))

    L.circleMarker([clickLat, clickLng], { radius: 6, color: '#f44336', fillColor: '#f44336', fillOpacity: 0.5, weight: 2, interactive: false }).addTo(lg)
    if (c.teePos) L.polyline([[fromLat, fromLng], [clickLat, clickLng]], { color: '#f44336', weight: 1.5, dashArray: '4,4', interactive: false }).addTo(lg)

    const clubs = c.strategy?.player?.clubs || []
    const rows: { type: string; avg: number; pct: number }[] = []
    for (const cl of clubs) {
      const std = cl.std_dev || cl.avg_yards * 0.08
      if (std === 0) continue
      const zScore = (targetDist - cl.avg_yards) / std
      const pct = Math.round((1 - normalCDF(zScore)) * 100)
      if (pct < 1 || pct > 99) continue
      rows.push({ type: cl.club_type, avg: cl.avg_yards, pct })
    }
    rows.sort((a, b) => b.pct - a.pct)

    // Update results in panel via DOM (simple approach)
    const resultsSection = document.getElementById('strategy-results-section')
    const resultsContent = document.getElementById('strategy-results-content')
    if (resultsSection && resultsContent) {
      resultsSection.style.display = ''
      let html = `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">Distance: <strong style="color:var(--text);">${targetDist}y</strong></div>`
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
  }, [map])

  const doClubRecommend = useCallback((clickLat: number, clickLng: number) => {
    const lg = layerRef.current
    lg.clearLayers()
    if (!map.hasLayer(lg)) lg.addTo(map)

    const c = ctxRef.current
    const from = c.ballPos || c.teePos
    const fromLat = from?.lat || clickLat
    const fromLng = from?.lng || clickLng
    const targetDist = Math.round(haversineYards(fromLat, fromLng, clickLat, clickLng))

    L.circleMarker([clickLat, clickLng], { radius: 6, color: '#2196F3', fillColor: '#2196F3', fillOpacity: 0.5, weight: 2, interactive: false }).addTo(lg)
    if (c.teePos) L.polyline([[fromLat, fromLng], [clickLat, clickLng]], { color: '#2196F3', weight: 1.5, dashArray: '4,4', interactive: false }).addTo(lg)
    L.marker([clickLat, clickLng], {
      icon: L.divIcon({ className: '', html: `<div style="display:inline-block;background:rgba(33,150,243,0.9);color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;white-space:nowrap;">${targetDist}y</div>`, iconSize: [0, 0], iconAnchor: [0, -10] }),
      interactive: false,
    }).addTo(lg)

    const clubs = c.strategy?.player?.clubs || []
    const ranked = clubs.filter((cl) => cl.avg_yards).map((cl) => {
      const diff = Math.abs(cl.avg_yards - targetDist)
      const std = cl.std_dev || cl.avg_yards * 0.08
      const matchPct = Math.max(0, Math.round(100 - (diff / std) * 25))
      return { type: cl.club_type, avg: cl.avg_yards, diff, matchPct }
    }).sort((a, b) => a.diff - b.diff)

    const resultsSection = document.getElementById('strategy-results-section')
    const resultsContent = document.getElementById('strategy-results-content')
    if (resultsSection && resultsContent) {
      resultsSection.style.display = ''
      let html = `<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;">Target: <strong style="color:var(--text);">${targetDist}y</strong></div>`
      if (ranked.length === 0) {
        html += '<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">No clubs with data</div>'
      } else {
        for (const r of ranked.slice(0, 5)) {
          const sign = r.avg > targetDist ? '+' : ''
          const color = r.matchPct >= 75 ? 'var(--accent)' : r.matchPct >= 40 ? 'var(--warning, #ff9800)' : 'var(--text-dim)'
          html += `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:0.78rem;"><span>${r.type} (${Math.round(r.avg)}y)</span><span style="color:${color};font-weight:600;">${sign}${Math.round(r.avg - targetDist)}y</span></div>`
        }
      }
      resultsContent.innerHTML = html
    }
  }, [map])

  // ── Map event handlers ──
  useEffect(() => {
    if (!visible) return

    const onMouseDown = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      const c = ctxRef.current
      if (c.drawPanelOpen && c.activeTool) return

      const tool = toolRef.current
      if (tool === 'ruler' || tool === 'cone') {
        draggingRef.current = true
        originRef.current = { lat: e.latlng.lat, lng: e.latlng.lng }
        map.dragging.disable()

        if (tool === 'ruler') {
          const lg = layerRef.current
          // Clear old ruler but keep ball marker
          const { line, label, origin, cursor } = rulerRef.current
          if (line) lg.removeLayer(line)
          if (label) lg.removeLayer(label)
          if (origin) lg.removeLayer(origin)
          if (cursor) lg.removeLayer(cursor)

          rulerRef.current.origin = L.circleMarker([e.latlng.lat, e.latlng.lng], { radius: 5, color: '#FF5722', fillColor: '#FF5722', fillOpacity: 1, interactive: false }).addTo(lg)
          rulerRef.current.line = L.polyline([[e.latlng.lat, e.latlng.lng], [e.latlng.lat, e.latlng.lng]], { color: '#FF5722', weight: 2.5, interactive: false }).addTo(lg)
          rulerRef.current.label = L.marker([e.latlng.lat, e.latlng.lng], {
            icon: L.divIcon({ className: '', html: '<div style="display:inline-block;background:rgba(255,87,34,0.92);color:#fff;padding:5px 12px;border-radius:5px;font-size:14px;font-weight:700;white-space:nowrap;line-height:1;margin-left:16px;margin-top:-28px;">0y</div>', iconSize: [0, 0] }),
            interactive: false,
          }).addTo(lg)
        }

        if (tool === 'cone') {
          const lg = layerRef.current
          lg.eachLayer((l) => { if (l !== ballMarkerRef.current) lg.removeLayer(l) })
        }
      }
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (!draggingRef.current || !originRef.current) return
      const tool = toolRef.current
      const o = originRef.current

      if (tool === 'ruler') {
        const dist = Math.round(haversineYards(o.lat, o.lng, e.latlng.lat, e.latlng.lng))
        rulerRef.current.line?.setLatLngs([[o.lat, o.lng], [e.latlng.lat, e.latlng.lng]])
        rulerRef.current.label?.setLatLng([e.latlng.lat, e.latlng.lng])
        rulerRef.current.label?.setIcon(L.divIcon({
          className: '',
          html: `<div style="display:inline-block;background:rgba(255,87,34,0.92);color:#fff;padding:5px 12px;border-radius:5px;font-size:14px;font-weight:700;white-space:nowrap;line-height:1;margin-left:16px;margin-top:-28px;">${dist}y</div>`,
          iconSize: [0, 0],
        }))
      }

      if (tool === 'cone') {
        const club = getClubData()
        if (club) {
          const aimBear = bearing(o.lat, o.lng, e.latlng.lat, e.latlng.lng)
          drawCone(o.lat, o.lng, aimBear, club)
        }
      }
    }

    const onMouseUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      map.dragging.enable()

      if (toolRef.current === 'ruler') {
        const lg = layerRef.current
        const { line, label, origin, cursor } = rulerRef.current
        if (line) { lg.removeLayer(line); rulerRef.current.line = null }
        if (label) { lg.removeLayer(label); rulerRef.current.label = null }
        if (origin) { lg.removeLayer(origin); rulerRef.current.origin = null }
        if (cursor) { lg.removeLayer(cursor); rulerRef.current.cursor = null }
      }
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      const c = ctxRef.current
      if (c.drawPanelOpen && c.activeTool) return

      const tool = toolRef.current
      const club = getClubData()

      if (tool === 'placeball') {
        const newPos = { lat: e.latlng.lat, lng: e.latlng.lng }
        c.setBallPos(newPos)
        const lg = layerRef.current
        if (ballMarkerRef.current) lg.removeLayer(ballMarkerRef.current)
        ballMarkerRef.current = L.circleMarker([newPos.lat, newPos.lng], {
          radius: 7, color: '#fff', fillColor: '#FFD700', fillOpacity: 1, weight: 2, interactive: false,
        }).addTo(lg)
        c.triggerRedraw()
        return
      }

      if (tool === 'landing' && club) drawLandingZone(e.latlng.lat, e.latlng.lng, club)
      else if (tool === 'carry') doCarryCheck(e.latlng.lat, e.latlng.lng)
      else if (tool === 'recommend') doClubRecommend(e.latlng.lat, e.latlng.lng)
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
      map.dragging.enable()
    }
  }, [map, visible, getClubData, drawCone, drawLandingZone, doCarryCheck, doClubRecommend])

  return null
}
