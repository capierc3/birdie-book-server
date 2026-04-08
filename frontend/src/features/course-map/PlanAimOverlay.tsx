import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useCourseMap } from './courseMapState'
// Uses context planAiming state
import { haversineYards, bearing, destPoint, normalCDF } from './geoUtils'
import { getClubColor } from './clubColors'

/**
 * PlanAimOverlay: When planAiming is set, enters aiming mode —
 * shows live dispersion cone following cursor, click to place shot.
 * Escape to cancel.
 */
export function PlanAimOverlay() {
  const map = useMap()
  const ctx = useCourseMap()
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const layerRef = useRef<L.LayerGroup>(L.layerGroup())

  const getClubData = (clubType: string) => {
    const c = ctx.strategy?.player?.clubs?.find((cl) => cl.club_type === clubType)
    if (!c) return null
    const lat = ctx.strategy?.player?.lateral_dispersion?.[clubType]
    return {
      color: c.color || getClubColor(clubType),
      avg: c.avg_yards,
      std: c.std_dev || c.avg_yards * 0.08,
      p10: c.p10 || c.avg_yards * 0.88,
      p90: c.p90 || c.avg_yards * 1.12,
      lateralStd: Math.min(lat?.lateral_std_dev || ((c.std_dev || 0) * 0.15) || 8, c.avg_yards * 0.12),
    }
  }

  useEffect(() => {
    const aiming = ctxRef.current.planAiming
    if (!aiming) {
      layerRef.current.clearLayers()
      if (map.hasLayer(layerRef.current)) map.removeLayer(layerRef.current)
      return
    }

    const lg = layerRef.current
    if (!map.hasLayer(lg)) lg.addTo(map)

    const { club, ballPos } = aiming
    const cd = getClubData(club)
    if (!cd || cd.avg <= 0) return

    map.getContainer().style.cursor = 'crosshair'
    map.dragging.disable()

    // Shot probability calculation
    const calcShotProb = (aimDist: number) => {
      const std = cd.std
      const acceptRadius = Math.max(8, Math.round(cd.avg * 0.12))
      const zLow = (aimDist - acceptRadius - cd.avg) / std
      const zHigh = (aimDist + acceptRadius - cd.avg) / std
      const pDist = normalCDF(zHigh) - normalCDF(zLow)
      const latStd = cd.lateralStd || std * 0.15
      const pLat = normalCDF(acceptRadius / latStd) - normalCDF(-acceptRadius / latStd)
      return Math.max(0.02, Math.min(0.99, Math.sqrt(pDist * pLat)))
    }

    const drawLiveCone = (aimLat: number, aimLng: number) => {
      lg.clearLayers()
      const cc = cd.color
      const b = bearing(ballPos.lat, ballPos.lng, aimLat, aimLng)
      const spreadInner = Math.atan2(cd.lateralStd, cd.avg)
      const spreadOuter = Math.atan2(cd.lateralStd * 2, cd.avg)
      const steps = 20

      // Outer cone
      const outerPts: [number, number][] = [[ballPos.lat, ballPos.lng]]
      for (let i = 0; i <= steps; i++) {
        const angle = b - spreadOuter + (i / steps) * spreadOuter * 2
        const pt = destPoint(ballPos.lat, ballPos.lng, angle, cd.p90)
        outerPts.push([pt.lat, pt.lng])
      }
      L.polygon(outerPts, { color: cc, weight: 1, fillColor: cc, fillOpacity: 0.08, interactive: false }).addTo(lg)

      // Inner cone
      const innerPts: [number, number][] = [[ballPos.lat, ballPos.lng]]
      for (let i = 0; i <= steps; i++) {
        const angle = b - spreadInner + (i / steps) * spreadInner * 2
        const pt = destPoint(ballPos.lat, ballPos.lng, angle, cd.avg)
        innerPts.push([pt.lat, pt.lng])
      }
      L.polygon(innerPts, { color: cc, weight: 1, fillColor: cc, fillOpacity: 0.2, interactive: false }).addTo(lg)

      // Aim line
      const aimPt = destPoint(ballPos.lat, ballPos.lng, b, cd.avg)
      L.polyline([[ballPos.lat, ballPos.lng], [aimPt.lat, aimPt.lng]], { color: '#fff', weight: 1.5, dashArray: '6,4', opacity: 0.7, interactive: false }).addTo(lg)

      // Distance + probability label at cursor
      const dist = Math.round(haversineYards(ballPos.lat, ballPos.lng, aimLat, aimLng))
      const prob = Math.round(calcShotProb(dist) * 100)
      const probColor = prob >= 60 ? '#4caf50' : prob >= 30 ? '#ff9800' : '#ef4444'
      L.marker([aimLat, aimLng], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:inline-block;background:rgba(0,0,0,0.85);color:#fff;padding:4px 10px;border-radius:5px;font-size:12px;font-weight:700;white-space:nowrap;margin-left:16px;margin-top:-14px;">${dist}y <span style="color:${probColor}">${prob}%</span></div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(lg)
    }

    const onMove = (e: L.LeafletMouseEvent) => {
      drawLiveCone(e.latlng.lat, e.latlng.lng)
    }

    const onClick = (e: L.LeafletMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      const aimResult = { lat: e.latlng.lat, lng: e.latlng.lng }

      // Clean up
      cleanup()

      // Fire custom event for PlanningPanel to handle
      window.dispatchEvent(new CustomEvent('plan-aim-complete', { detail: aimResult }))
    }

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup()
        window.dispatchEvent(new CustomEvent('plan-aim-cancel'))
      }
    }

    const cleanup = () => {
      lg.clearLayers()
      map.off('mousemove', onMove)
      map.off('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
      map.getContainer().style.cursor = ''
      map.dragging.enable()
      ctxRef.current.setPlanAiming(null)
    }

    map.on('mousemove', onMove)
    map.on('mousedown', onClick)
    document.addEventListener('keydown', onEsc)

    return () => {
      map.off('mousemove', onMove)
      map.off('mousedown', onClick)
      document.removeEventListener('keydown', onEsc)
      lg.clearLayers()
      map.getContainer().style.cursor = ''
      map.dragging.enable()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ctx.planAiming])

  return null
}
