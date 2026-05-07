import { useEffect, useRef, useMemo } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, Polygon, Position } from 'geojson'
import { useMobileMap } from './MobileMapContext'
import { haversineYards, destPoint, bearing } from '../geoUtils'
import { rankClubs, findNearbyHazards, computeGreenFrontBack, determineShotContext, getTeeStrategy } from '../caddieCalc'

export interface RangefinderData {
  distToGreenCenter: number | null
  distToGreenFront: number | null
  distToGreenBack: number | null
  nearbyHazards: { type: string; name?: string | null; distance: number }[]
  clubRec: { club: string; avgYards: number; delta: number }[]
  gpsActive: boolean
}

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }
const RING_SEGMENTS = 48

/** Build a geodesic polygon ring around (lat,lng) of accuracyMeters radius. */
function accuracyRingPolygon(lat: number, lng: number, accuracyMeters: number): FeatureCollection {
  const yards = accuracyMeters * 1.09361
  const ring: Position[] = []
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const bearingRad = (i / RING_SEGMENTS) * 2 * Math.PI
    const p = destPoint(lat, lng, bearingRad, yards)
    ring.push([p.lng, p.lat])
  }
  const feature: Feature<Polygon> = {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  }
  return { type: 'FeatureCollection', features: [feature] }
}

/**
 * GpsRangefinder — Stage 20d MapLibre version.
 *
 * Renders the GPS dot + accuracy ring as JSX (Marker + GeoJSON polygon source)
 * and emits computed distance/club-rec data via onData. Pure calc logic
 * (`rankClubs`, `findNearbyHazards`, `computeGreenFrontBack`) is unchanged.
 */
export function GpsRangefinder({ onData }: { onData: (data: RangefinderData) => void }) {
  const ctx = useMobileMap()
  const { gps, greenPos, greenBoundary, hazards, strategy, ballPos, playMode, teePos, formValues, fairwayPath } = ctx
  const onDataRef = useRef(onData)
  onDataRef.current = onData

  const accuracyFC = useMemo<FeatureCollection>(() => {
    if (gps.lat == null || gps.lng == null) return EMPTY_FC
    const acc = gps.accuracy ?? 10
    return accuracyRingPolygon(gps.lat, gps.lng, acc)
  }, [gps.lat, gps.lng, gps.accuracy])

  // Compute distances — play mode uses live GPS; review mode uses ballPos
  // (defaults to tee, user-movable) so distances aren't ruined by off-course GPS.
  useEffect(() => {
    const originLat = playMode ? gps.lat : (ballPos?.lat ?? gps.lat ?? null)
    const originLng = playMode ? gps.lng : (ballPos?.lng ?? gps.lng ?? null)

    if (originLat == null || originLng == null) {
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

    const distCenter = Math.round(haversineYards(originLat, originLng, greenPos.lat, greenPos.lng))
    const fb = computeGreenFrontBack(originLat, originLng, greenPos.lat, greenPos.lng, greenBoundary)
    const distFromTee = teePos
      ? haversineYards(originLat, originLng, teePos.lat, teePos.lng)
      : undefined
    const context = determineShotContext(distCenter, true, distFromTee)

    let nearby: ReturnType<typeof findNearbyHazards>
    let target = distCenter
    const origin = { lat: originLat, lng: originLng }

    if (context === 'tee' && strategy?.player?.clubs?.length) {
      // Use dogleg-aware strategy: returns aim, target, and corridor-projected hazards.
      const par = parseInt(formValues.par || '4', 10) || 4
      const yardage = parseInt(formValues.yardage || '0', 10) || distCenter
      const teeStrategy = getTeeStrategy(par, yardage, origin, greenPos, fairwayPath, hazards, strategy.player.clubs)
      target = teeStrategy.targetYards
      nearby = teeStrategy.corridorHazards
    } else {
      // Approach / short-game / green: aim straight at the green.
      const aimBearing = bearing(originLat, originLng, greenPos.lat, greenPos.lng)
      nearby = findNearbyHazards(origin, hazards, context, { aimBearing, corridorYards: 30 })
    }

    const clubRec: RangefinderData['clubRec'] = []
    if (distCenter && strategy?.player?.clubs?.length) {
      const ranked = rankClubs(strategy.player.clubs, target, {
        count: 2,
        excludeUnknown: true,
        excludeDriver: context !== 'tee',
        preferLong: context === 'tee',
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
  }, [gps.lat, gps.lng, greenPos, greenBoundary, hazards, strategy, ballPos, playMode, teePos, formValues.par, formValues.yardage, fairwayPath])

  // GPS dot + accuracy ring only render in play mode — in review the user
  // isn't on the course, so showing their off-course location is misleading.
  if (!playMode || gps.lat == null || gps.lng == null) return null

  return (
    <>
      <Source id="m-gps-acc" type="geojson" data={accuracyFC}>
        <Layer
          id="m-gps-acc-fill"
          type="fill"
          paint={{ 'fill-color': '#2196F3', 'fill-opacity': 0.1 }}
        />
        <Layer
          id="m-gps-acc-line"
          type="line"
          paint={{ 'line-color': '#2196F3', 'line-width': 1, 'line-opacity': 0.5 }}
        />
      </Source>
      <Marker longitude={gps.lng} latitude={gps.lat} anchor="center">
        <div
          className="gps-pulse-marker"
          style={{
            width: 16, height: 16, borderRadius: '50%',
            background: '#2196F3', border: '3px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        />
      </Marker>
    </>
  )
}
