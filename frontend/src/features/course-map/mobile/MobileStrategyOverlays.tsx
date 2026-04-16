import { useEffect, useRef, useCallback } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMobileMap } from './MobileMapContext'
import { haversineYards, destPoint, bearing } from '../geoUtils'
import { getClubStats, rankClubs, computeCarryProbabilities } from '../caddieCalc'
import type { ClubStats, RankedClub, CarryResult } from '../caddieCalc'

export interface ToolResult {
  type: 'ruler' | 'carry' | 'recommend' | 'cone' | 'landing'
  distance?: number
  carryResults?: CarryResult[]
  clubResults?: RankedClub[]
}

interface Props {
  onToolResult: (result: ToolResult | null) => void
}

/**
 * MobileStrategyOverlays: headless Leaflet component.
 * Renders strategy tool overlays on the mobile map using GPS as origin.
 */
export function MobileStrategyOverlays({ onToolResult }: Props) {
  const map = useMap()
  const ctx = useMobileMap()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const onToolResultRef = useRef(onToolResult)
  onToolResultRef.current = onToolResult

  const layerRef = useRef<L.LayerGroup>(L.layerGroup())

  const getSelectedClub = useCallback((): ClubStats | null => {
    const c = ctxRef.current
    const clubType = c.selectedClubType
    if (!clubType) return null
    const player = c.strategy?.player
    const club = player?.clubs?.find(cl => cl.club_type === clubType)
    if (!club) return null
    return getClubStats(club, player?.lateral_dispersion?.[clubType], player?.miss_tendencies?.[clubType])
  }, [])

  // Clear overlays when tool changes
  useEffect(() => {
    const lg = layerRef.current
    lg.clearLayers()
    if (ctx.activeRangefinderTool === 'none') {
      if (map.hasLayer(lg)) map.removeLayer(lg)
      onToolResultRef.current(null)
    } else {
      if (!map.hasLayer(lg)) lg.addTo(map)
    }
  }, [map, ctx.activeRangefinderTool])

  // ── Cone: auto-render from GPS toward green ──
  useEffect(() => {
    if (ctx.activeRangefinderTool !== 'cone') return
    const { gps, greenPos } = ctxRef.current
    if (gps.lat == null || gps.lng == null || !greenPos) return

    const club = getSelectedClub()
    if (!club) return

    const lg = layerRef.current
    lg.clearLayers()

    const aimBear = bearing(gps.lat, gps.lng, greenPos.lat, greenPos.lng)
    drawCone(lg, gps.lat, gps.lng, aimBear, club)
    onToolResultRef.current({ type: 'cone' })
  }, [ctx.activeRangefinderTool, ctx.selectedClubType, ctx.gps.lat, ctx.gps.lng, getSelectedClub])

  // ── Landing: auto-render from GPS ──
  useEffect(() => {
    if (ctx.activeRangefinderTool !== 'landing') return
    const { gps, greenPos } = ctxRef.current
    if (gps.lat == null || gps.lng == null) return

    const club = getSelectedClub()
    if (!club) return

    const lg = layerRef.current
    lg.clearLayers()

    drawLandingZone(lg, gps.lat, gps.lng, club, greenPos)
    onToolResultRef.current({ type: 'landing' })
  }, [ctx.activeRangefinderTool, ctx.selectedClubType, ctx.gps.lat, ctx.gps.lng, getSelectedClub])

  // ── Map tap handlers for interactive tools (ruler, carry, recommend) ──
  useEffect(() => {
    const tool = ctx.activeRangefinderTool
    if (tool !== 'ruler' && tool !== 'carry' && tool !== 'recommend') return

    const onClick = (e: L.LeafletMouseEvent) => {
      const c = ctxRef.current
      // Don't handle taps when edit mode is active
      if (c.editMode) return

      const gps = c.gps
      const fromLat = gps.lat ?? c.teePos?.lat
      const fromLng = gps.lng ?? c.teePos?.lng
      if (fromLat == null || fromLng == null) return

      const targetDist = Math.round(haversineYards(fromLat, fromLng, e.latlng.lat, e.latlng.lng))

      const lg = layerRef.current
      lg.clearLayers()

      // Draw line from origin to tap
      L.polyline([[fromLat, fromLng], [e.latlng.lat, e.latlng.lng]], {
        color: tool === 'carry' ? '#f44336' : tool === 'recommend' ? '#2196F3' : '#FF5722',
        weight: 2, dashArray: '4,4', interactive: false,
      }).addTo(lg)

      // Target marker
      const color = tool === 'carry' ? '#f44336' : tool === 'recommend' ? '#2196F3' : '#FF5722'
      L.circleMarker([e.latlng.lat, e.latlng.lng], {
        radius: 6, color, fillColor: color, fillOpacity: 0.5, weight: 2, interactive: false,
      }).addTo(lg)

      // Distance label
      L.marker([e.latlng.lat, e.latlng.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:inline-block;background:rgba(0,0,0,0.8);color:#fff;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:700;white-space:nowrap;">${targetDist}y</div>`,
          iconSize: [0, 0], iconAnchor: [0, -10],
        }),
        interactive: false,
      }).addTo(lg)

      if (tool === 'ruler') {
        onToolResultRef.current({ type: 'ruler', distance: targetDist })
      } else if (tool === 'carry') {
        const clubs = c.strategy?.player?.clubs || []
        const carryResults = computeCarryProbabilities(clubs, targetDist)
        onToolResultRef.current({ type: 'carry', distance: targetDist, carryResults })
      } else if (tool === 'recommend') {
        const clubs = c.strategy?.player?.clubs || []
        const clubResults = rankClubs(clubs, targetDist, { count: 5 })
        onToolResultRef.current({ type: 'recommend', distance: targetDist, clubResults })
      }
    }

    map.on('click', onClick)
    return () => { map.off('click', onClick) }
  }, [map, ctx.activeRangefinderTool])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const lg = layerRef.current
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map])

  return null
}

// ── Drawing helpers (Leaflet-specific, not shared) ──

function drawCone(lg: L.LayerGroup, originLat: number, originLng: number, aimBearing: number, club: ClubStats) {
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
}

function drawLandingZone(lg: L.LayerGroup, clickLat: number, clickLng: number, club: ClubStats, greenPos: { lat: number; lng: number } | null) {
  let aimBear = 0
  if (greenPos) aimBear = bearing(clickLat, clickLng, greenPos.lat, greenPos.lng)

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

  // Outer band (p10 to p90)
  const outerArc = arcPoints(club.p90)
  const innerArcRev = arcPoints(club.p10).reverse()
  L.polygon([...outerArc, ...innerArcRev], { color: club.color, weight: 1, fillColor: club.color, fillOpacity: 0.08, interactive: false }).addTo(lg)

  // Inner band (avg ± 0.5σ)
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
}
