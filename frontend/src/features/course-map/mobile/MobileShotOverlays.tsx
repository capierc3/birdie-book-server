import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMobileMap } from './MobileMapContext'
import { getClubColor } from '../clubColors'

/**
 * MobileShotOverlays: Renders shot polylines on mobile map.
 * Always visible (no toggle), read-only.
 */
export function MobileShotOverlays() {
  const map = useMap()
  const ctx = useMobileMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails, showOverlays } = ctx
  const layerRef = useRef<L.LayerGroup>(L.layerGroup())

  const teeRounds = useMemo(() => allRoundDetails.filter(r => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'

  const shots = useMemo(() => {
    if (isHistoric) {
      return teeRounds
        .flatMap(r => (r.holes || []).filter(h => h.hole_number === currentHole).flatMap(h => h.shots || []))
        .filter(sh => sh.start_lat && sh.end_lat)
    }
    if (roundDetail) {
      const rh = (roundDetail.holes || []).find(h => h.hole_number === currentHole)
      return (rh?.shots || []).filter(sh => sh.start_lat && sh.end_lat)
    }
    return []
  }, [isHistoric, teeRounds, roundDetail, currentHole])

  useEffect(() => {
    const lg = layerRef.current
    if (!map.hasLayer(lg)) lg.addTo(map)
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map])

  useEffect(() => {
    const lg = layerRef.current
    lg.clearLayers()

    if (!showOverlays) return

    shots.forEach((shot, idx) => {
      if (!shot.start_lat || !shot.start_lng || !shot.end_lat || !shot.end_lng) return
      const start: [number, number] = [shot.start_lat, shot.start_lng]
      const end: [number, number] = [shot.end_lat, shot.end_lng]
      const color = getClubColor(shot.club)

      L.polyline([start, end], {
        color,
        weight: isHistoric ? 2 : 3,
        opacity: isHistoric ? 0.4 : 0.8,
        interactive: false,
      }).addTo(lg)

      L.circleMarker(end, {
        radius: isHistoric ? 3 : 5,
        color, fillColor: color,
        fillOpacity: isHistoric ? 0.5 : 0.8,
        weight: 1,
        interactive: false,
      }).addTo(lg)

      if (!isHistoric) {
        L.marker(start, {
          icon: L.divIcon({
            className: 'leaflet-shot-number',
            html: `<div style="background:${color};color:#000;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #000;">${idx + 1}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        }).addTo(lg)
      }
    })
  }, [shots, isHistoric, showOverlays])

  return null
}
