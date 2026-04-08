import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useCourseMap } from './courseMapState'
import { getClubColor } from './clubColors'

/**
 * ShotOverlays: Renders shot polylines on the Leaflet map.
 * Uses shared context state for round data.
 */
export function ShotOverlays({ visible }: { visible: boolean }) {
  const map = useMap()
  const ctx = useCourseMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx
  const layerRef = useRef<L.LayerGroup>(L.layerGroup())

  const teeRounds = useMemo(() => allRoundDetails.filter((r) => r.tee_id === teeId), [allRoundDetails, teeId])
  const isHistoric = viewMode === 'historic'

  const shots = useMemo(() => {
    if (isHistoric) {
      return teeRounds
        .flatMap((r) => (r.holes || []).filter((h) => h.hole_number === currentHole).flatMap((h) => h.shots || []))
        .filter((sh) => sh.start_lat && sh.end_lat)
    }
    if (roundDetail) {
      const rh = (roundDetail.holes || []).find((h) => h.hole_number === currentHole)
      return (rh?.shots || []).filter((sh) => sh.start_lat && sh.end_lat)
    }
    return []
  }, [isHistoric, teeRounds, roundDetail, currentHole])

  // Manage layer group on map
  useEffect(() => {
    const lg = layerRef.current
    if (visible && !map.hasLayer(lg)) lg.addTo(map)
    if (!visible && map.hasLayer(lg)) { lg.clearLayers(); map.removeLayer(lg) }
    return () => {
      lg.clearLayers()
      if (map.hasLayer(lg)) map.removeLayer(lg)
    }
  }, [map, visible])

  // Draw shots
  useEffect(() => {
    const lg = layerRef.current
    lg.clearLayers()
    if (!visible) return

    shots.forEach((shot, idx) => {
      if (!shot.start_lat || !shot.start_lng || !shot.end_lat || !shot.end_lng) return
      const start: [number, number] = [shot.start_lat, shot.start_lng]
      const end: [number, number] = [shot.end_lat, shot.end_lng]
      const color = getClubColor(shot.club)

      const line = L.polyline([start, end], {
        color,
        weight: isHistoric ? 2 : 3,
        opacity: isHistoric ? 0.4 : 0.8,
        interactive: !isHistoric,
      }).addTo(lg)

      L.circleMarker(end, {
        radius: isHistoric ? 3 : 5,
        color, fillColor: color,
        fillOpacity: isHistoric ? 0.5 : 0.8,
        weight: 1,
        interactive: false,
      }).addTo(lg)

      // Single-round: numbered badge at start + tooltip
      if (!isHistoric) {
        L.marker(start, {
          icon: L.divIcon({
            className: 'leaflet-shot-number',
            html: `<div style="background:${color};color:#000;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #000;">${idx + 1}</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
        }).addTo(lg)

        const dist = shot.distance_yards ? `${shot.distance_yards.toFixed(0)} yds` : ''
        const club = shot.club || ''
        if (dist || club) {
          line.bindTooltip(`${club}${club && dist ? ' — ' : ''}${dist}`, { sticky: true })
        }
      }
    })
  }, [shots, visible])

  return null
}
