import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMobileMap } from './MobileMapContext'
import { haversineYards } from '../geoUtils'
import { rankClubs, findNearbyHazards, computeGreenFrontBack, determineShotContext } from '../caddieCalc'

export interface RangefinderData {
  distToGreenCenter: number | null
  distToGreenFront: number | null
  distToGreenBack: number | null
  nearbyHazards: { type: string; name?: string | null; distance: number }[]
  clubRec: { club: string; avgYards: number; delta: number }[]
  gpsActive: boolean
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
      onDataRef.current({
        distToGreenCenter: null, distToGreenFront: null, distToGreenBack: null,
        nearbyHazards: [], clubRec: [], gpsActive: true,
      })
      return
    }

    const distCenter = Math.round(haversineYards(gps.lat, gps.lng, greenPos.lat, greenPos.lng))

    const fb = computeGreenFrontBack(gps.lat, gps.lng, greenPos.lat, greenPos.lng, greenBoundary)

    // Determine context for hazard detection
    const context = determineShotContext(distCenter, true)

    // Nearby hazards using shared function
    const nearby = findNearbyHazards({ lat: gps.lat, lng: gps.lng }, hazards, context)

    // Club recommendation using shared function
    const clubRec: RangefinderData['clubRec'] = []
    if (distCenter && strategy?.player?.clubs?.length) {
      const ranked = rankClubs(strategy.player.clubs, distCenter, {
        count: 2,
        excludeUnknown: true,
        excludeDriver: context !== 'tee',
      })
      for (const r of ranked) {
        clubRec.push({ club: r.type, avgYards: Math.round(r.avg), delta: r.delta })
      }
    }

    onDataRef.current({
      distToGreenCenter: distCenter,
      distToGreenFront: fb.front,
      distToGreenBack: fb.back,
      nearbyHazards: nearby,
      clubRec,
      gpsActive: true,
    })
  }, [gps.lat, gps.lng, greenPos, greenBoundary, hazards, strategy])

  return null
}
