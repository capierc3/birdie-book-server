import { useEffect, useRef, useMemo } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMobileMap } from './MobileMapContext'
import { haversineYards, bearing } from '../geoUtils'
import type { LatLng } from '../courseMapState'

export interface RangefinderData {
  distToGreenCenter: number | null
  distToGreenFront: number | null
  distToGreenBack: number | null
  nearbyHazards: { type: string; name?: string | null; distance: number }[]
  clubRec: { club: string; avgYards: number }[]
  gpsActive: boolean
}

/** Compute green front/back by projecting boundary onto GPS→flag line */
function computeGreenFrontBack(
  gpsLat: number, gpsLng: number,
  flagLat: number, flagLng: number,
  greenBoundary: LatLng[],
): { front: number; back: number } {
  const centerDist = haversineYards(gpsLat, gpsLng, flagLat, flagLng)
  if (greenBoundary.length < 3) {
    return { front: Math.max(0, centerDist - 10), back: centerDist + 10 }
  }

  const bear = bearing(gpsLat, gpsLng, flagLat, flagLng)
  let minProj = Infinity, maxProj = -Infinity

  for (const pt of greenBoundary) {
    const dist = haversineYards(gpsLat, gpsLng, pt.lat, pt.lng)
    const ptBear = bearing(gpsLat, gpsLng, pt.lat, pt.lng)
    const proj = dist * Math.cos(ptBear - bear)
    if (proj < minProj) minProj = proj
    if (proj > maxProj) maxProj = proj
  }

  return {
    front: Math.max(0, Math.round(minProj)),
    back: Math.round(maxProj),
  }
}

/**
 * GpsRangefinder: headless Leaflet component.
 * Renders GPS marker + accuracy ring, computes distances.
 */
export function GpsRangefinder({ onData }: { onData: (data: RangefinderData) => void }) {
  const map = useMap()
  const ctx = useMobileMap()
  const { gps, greenPos, greenBoundary, hazards, strategy } = ctx
  const markerRef = useRef<L.CircleMarker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  // Create / update GPS marker imperatively
  useEffect(() => {
    if (gps.lat == null || gps.lng == null) {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null }
      if (accuracyRef.current) { map.removeLayer(accuracyRef.current); accuracyRef.current = null }
      return
    }

    const pos: [number, number] = [gps.lat, gps.lng]

    if (!markerRef.current) {
      markerRef.current = L.circleMarker(pos, {
        radius: 8,
        color: '#2196F3',
        fillColor: '#2196F3',
        fillOpacity: 0.9,
        weight: 3,
        className: 'gps-pulse-marker',
      }).addTo(map)
    } else {
      markerRef.current.setLatLng(pos)
    }

    // Accuracy ring
    const accMeters = gps.accuracy ?? 10
    if (!accuracyRef.current) {
      accuracyRef.current = L.circle(pos, {
        radius: accMeters,
        color: '#2196F3',
        fillColor: '#2196F3',
        fillOpacity: 0.1,
        weight: 1,
        interactive: false,
      }).addTo(map)
    } else {
      accuracyRef.current.setLatLng(pos)
      accuracyRef.current.setRadius(accMeters)
    }

    return () => {
      if (markerRef.current) { map.removeLayer(markerRef.current); markerRef.current = null }
      if (accuracyRef.current) { map.removeLayer(accuracyRef.current); accuracyRef.current = null }
    }
  }, [map, gps.lat, gps.lng, gps.accuracy])

  // Compute distances
  useEffect(() => {
    if (gps.lat == null || gps.lng == null) {
      onDataRef.current({
        distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
        nearbyHazards: [], clubRec: [], gpsActive: false,
      })
      return
    }

    if (!greenPos) {
      // GPS is active but hole has no green position — report GPS active with no distances
      onDataRef.current({
        distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
        nearbyHazards: [], clubRec: [], gpsActive: true,
      })
      return
    }

    const distCenter = Math.round(haversineYards(gps.lat, gps.lng, greenPos.lat, greenPos.lng))

    let distFront: number | null = null
    let distBack: number | null = null
    if (greenPos) {
      const fb = computeGreenFrontBack(gps.lat, gps.lng, greenPos.lat, greenPos.lng, greenBoundary)
      distFront = fb.front
      distBack = fb.back
    }

    // Nearby hazards
    const nearbyHazards: RangefinderData['nearbyHazards'] = []
    for (const h of hazards) {
      if (h._deleted || h.boundary.length < 3) continue
      let minDist = Infinity
      for (const p of h.boundary) {
        const d = haversineYards(gps.lat, gps.lng, p.lat, p.lng)
        if (d < minDist) minDist = d
      }
      if (minDist < 300) {
        nearbyHazards.push({ type: h.hazard_type, name: h.name, distance: Math.round(minDist) })
      }
    }
    nearbyHazards.sort((a, b) => a.distance - b.distance)

    // Club recommendation
    const clubRec: RangefinderData['clubRec'] = []
    if (distCenter && strategy?.player?.clubs?.length) {
      const clubs = [...strategy.player.clubs]
        .filter(c => c.club_type !== 'Unknown')
        .sort((a, b) => Math.abs((a.avg_yards || 0) - distCenter) - Math.abs((b.avg_yards || 0) - distCenter))
      for (const c of clubs.slice(0, 2)) {
        clubRec.push({ club: c.club_type, avgYards: Math.round(c.avg_yards || 0) })
      }
    }

    onDataRef.current({ distToGreenCenter: distCenter, distToGreenFront: distFront, distToGreenBack: distBack, nearbyHazards, clubRec, gpsActive: true })
  }, [gps.lat, gps.lng, greenPos, greenBoundary, hazards, strategy])

  return null
}
