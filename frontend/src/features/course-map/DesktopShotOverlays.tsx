import { useMemo } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, LineString, Point } from 'geojson'
import { useCourseMap } from './courseMapState'
import { getClubColor } from './clubColors'

/**
 * DesktopShotOverlays — MapLibre version (Stage 20f).
 *
 * Renders shot polylines + endpoint dots from rounds. In single-round mode,
 * adds numbered badges at each shot's start with a hover tooltip showing club
 * and distance. In historic mode, lines/dots are dimmer and badges are skipped.
 */
export function DesktopShotOverlays({ visible }: { visible: boolean }) {
  const ctx = useCourseMap()
  const { currentHole, teeId, viewMode, roundDetail, allRoundDetails } = ctx
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
    if (!visible) return { type: 'FeatureCollection', features: [] }
    const features: Feature<LineString>[] = []
    shots.forEach((shot) => {
      if (!shot.start_lat || !shot.start_lng || !shot.end_lat || !shot.end_lng) return
      const color = getClubColor(shot.club)
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [shot.start_lng, shot.start_lat],
            [shot.end_lng, shot.end_lat],
          ],
        },
        properties: { color },
      })
    })
    return { type: 'FeatureCollection', features }
  }, [shots, visible])

  const endpointsFC = useMemo<FeatureCollection>(() => {
    if (!visible) return { type: 'FeatureCollection', features: [] }
    const features: Feature<Point>[] = []
    shots.forEach((shot) => {
      if (!shot.end_lat || !shot.end_lng) return
      const color = getClubColor(shot.club)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [shot.end_lng, shot.end_lat] },
        properties: { color },
      })
    })
    return { type: 'FeatureCollection', features }
  }, [shots, visible])

  if (!visible) return null

  return (
    <>
      <Source id="d-shot-lines" type="geojson" data={linesFC}>
        <Layer
          id="d-shot-lines-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': isHistoric ? 2 : 3,
            'line-opacity': isHistoric ? 0.4 : 0.8,
          }}
        />
      </Source>
      <Source id="d-shot-ends" type="geojson" data={endpointsFC}>
        <Layer
          id="d-shot-ends-circle"
          type="circle"
          paint={{
            'circle-radius': isHistoric ? 3 : 5,
            'circle-color': ['get', 'color'],
            'circle-opacity': isHistoric ? 0.5 : 0.8,
            'circle-stroke-color': ['get', 'color'],
            'circle-stroke-width': 1,
          }}
        />
      </Source>

      {/* Numbered badges + tooltips only in single-round mode */}
      {!isHistoric && shots.map((shot, idx) => {
        if (!shot.start_lat || !shot.start_lng) return null
        const color = getClubColor(shot.club)
        const dist = shot.distance_yards ? `${shot.distance_yards.toFixed(0)} yds` : ''
        const club = shot.club || ''
        const tooltip = `${club}${club && dist ? ' — ' : ''}${dist}`
        return (
          <Marker
            key={`shot-${idx}`}
            longitude={shot.start_lng}
            latitude={shot.start_lat}
            anchor="center"
          >
            <div
              title={tooltip || undefined}
              style={{
                background: color, color: '#000',
                width: 20, height: 20, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 'bold',
                border: '2px solid #000',
                cursor: 'default',
              }}
            >{idx + 1}</div>
          </Marker>
        )
      })}
    </>
  )
}
