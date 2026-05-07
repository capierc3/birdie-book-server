import { useMemo } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, LineString, Point } from 'geojson'
import { useMobileMap } from './MobileMapContext'
import { getClubColor } from '../clubColors'

/**
 * MobileShotOverlays — read-only MapLibre version (Stage 20d).
 *
 * Renders shot lines + endpoint dots from current round (single-round mode) or
 * all rounds for the current tee (historic mode). Numbered start markers only
 * appear in single-round mode.
 */

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function MobileShotOverlays() {
  const ctx = useMobileMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails, showOverlays } = ctx
  const isHistoric = viewMode === 'historic'

  const shots = useMemo(() => {
    if (isHistoric) {
      return allRoundDetails
        .filter(r => r.tee_id === teeId)
        .flatMap(r => (r.holes || []).filter(h => h.hole_number === currentHole).flatMap(h => h.shots || []))
        .filter(sh => sh.start_lat && sh.end_lat)
    }
    if (roundDetail) {
      const rh = (roundDetail.holes || []).find(h => h.hole_number === currentHole)
      return (rh?.shots || []).filter(sh => sh.start_lat && sh.end_lat)
    }
    return []
  }, [isHistoric, allRoundDetails, teeId, roundDetail, currentHole])

  const linesFC = useMemo<FeatureCollection>(() => {
    if (!showOverlays) return EMPTY_FC
    const features: Feature<LineString>[] = shots
      .filter(sh => sh.start_lat && sh.start_lng && sh.end_lat && sh.end_lng)
      .map(sh => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [sh.start_lng!, sh.start_lat!],
            [sh.end_lng!, sh.end_lat!],
          ],
        },
        properties: { color: getClubColor(sh.club) },
      }))
    return { type: 'FeatureCollection', features }
  }, [shots, showOverlays])

  const endsFC = useMemo<FeatureCollection>(() => {
    if (!showOverlays) return EMPTY_FC
    const features: Feature<Point>[] = shots
      .filter(sh => sh.end_lat && sh.end_lng)
      .map(sh => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [sh.end_lng!, sh.end_lat!] },
        properties: { color: getClubColor(sh.club) },
      }))
    return { type: 'FeatureCollection', features }
  }, [shots, showOverlays])

  // Numbered start badges — only in single-round mode
  const startBadges = useMemo(() => {
    if (!showOverlays || isHistoric) return []
    return shots
      .filter(sh => sh.start_lat && sh.start_lng)
      .map((sh, idx) => ({
        lat: sh.start_lat!,
        lng: sh.start_lng!,
        color: getClubColor(sh.club),
        n: idx + 1,
      }))
  }, [shots, isHistoric, showOverlays])

  return (
    <>
      <Source id="m-shot-lines" type="geojson" data={linesFC}>
        {/* Soft glow halo behind each shot for visual pop */}
        <Layer
          id="m-shot-lines-glow"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': isHistoric ? 8 : 12,
            'line-opacity': isHistoric ? 0.18 : 0.30,
            'line-blur': 5,
          }}
        />
        {/* Solid main line on top of the glow */}
        <Layer
          id="m-shot-lines-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': isHistoric ? 3.5 : 5,
            'line-opacity': isHistoric ? 0.85 : 0.95,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </Source>
      <Source id="m-shot-ends" type="geojson" data={endsFC}>
        {/* Glow halo behind the endpoint */}
        <Layer
          id="m-shot-ends-halo"
          type="circle"
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': isHistoric ? 9 : 12,
            'circle-opacity': 0.25,
            'circle-blur': 0.6,
          }}
        />
        <Layer
          id="m-shot-ends-circle"
          type="circle"
          paint={{
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1.5,
            'circle-radius': isHistoric ? 4 : 6,
            'circle-opacity': isHistoric ? 0.85 : 0.95,
          }}
        />
      </Source>
      {startBadges.map((b, i) => (
        <Marker key={i} longitude={b.lng} latitude={b.lat} anchor="center">
          <div
            style={{
              background: b.color, color: '#000',
              width: 20, height: 20, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 'bold', border: '2px solid #000',
              pointerEvents: 'none',
            }}
          >{b.n}</div>
        </Marker>
      ))}
    </>
  )
}
