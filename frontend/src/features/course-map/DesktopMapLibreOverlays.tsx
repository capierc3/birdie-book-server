import { useMemo } from 'react'
import { Source, Layer, Marker } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, Polygon, Position } from 'geojson'
import { useCourseMap, TEE_COLORS, HAZARD_COLORS } from './courseMapState'
import type { LatLng } from './courseMapState'
import { haversineYards } from './geoUtils'

/**
 * DesktopMapLibreOverlays — read-only desktop overlays (Stage 20f).
 *
 * Renders fairway centerline, fairway/green boundaries, hazards (with holes),
 * tee markers, green flag, and segment distance labels. No editing markers,
 * no drag handles, no click-to-place — those return in Stage 20g.
 */

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

function ringFromLatLng(pts: LatLng[]): Position[] {
  const ring: Position[] = pts.map(p => [p.lng, p.lat])
  if (ring.length >= 3) {
    const f = ring[0]
    const l = ring[ring.length - 1]
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  }
  return ring
}

export function DesktopMapLibreOverlays() {
  const ctx = useCourseMap()
  const {
    teePos, greenPos, fairwayPath, teePositions, fairwayBoundaries,
    greenBoundary, hazards, course, teeId, drawPanelOpen, activeTool, ballPos,
    setTeePos, setTeePositions, setGreenPos, setDirty, triggerRedraw,
  } = ctx
  // Tees/green are draggable only in Edit Nodes mode (Drawing Tools panel).
  const editNodes = drawPanelOpen && activeTool === 'edit-nodes'

  const activeTeeName = course?.tees?.find(t => t.id === teeId)?.tee_name ?? ''

  const fairwayBoundaryFC = useMemo<FeatureCollection>(() => {
    const features: Feature<Polygon>[] = fairwayBoundaries
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.length >= 3)
      .map(({ p, idx }) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringFromLatLng(p)] },
        properties: { idx },
      }))
    return { type: 'FeatureCollection', features }
  }, [fairwayBoundaries])

  const greenBoundaryFC = useMemo<FeatureCollection>(() => {
    if (greenBoundary.length < 3) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringFromLatLng(greenBoundary)] },
        properties: {},
      }],
    }
  }, [greenBoundary])

  const hazardsFC = useMemo<FeatureCollection>(() => {
    const features: Feature<Polygon>[] = hazards
      .map((h, idx) => ({ h, idx }))
      .filter(({ h }) => !h._deleted && h.boundary.length >= 3)
      .map(({ h, idx }) => {
        const [fill, stroke] = HAZARD_COLORS[h.hazard_type] ?? ['#999', '#666']
        // GeoJSON Polygon coords: first ring is outer, rest are holes (cutouts).
        const coordinates = [
          ringFromLatLng(h.boundary),
          ...(h.holes ?? []).filter(r => r.length >= 3).map(ringFromLatLng),
        ]
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates },
          properties: { fill, stroke, hazard_type: h.hazard_type, name: h.name ?? '', idx },
        }
      })
    return { type: 'FeatureCollection', features }
  }, [hazards])

  const centerlineFC = useMemo<FeatureCollection>(() => {
    const pts: Position[] = []
    if (teePos) pts.push([teePos.lng, teePos.lat])
    fairwayPath.forEach(p => pts.push([p.lng, p.lat]))
    if (greenPos) pts.push([greenPos.lng, greenPos.lat])
    if (pts.length < 2) return EMPTY_FC
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: pts },
        properties: {},
      }],
    }
  }, [teePos, greenPos, fairwayPath])

  // Segment distance labels along the centerline — always visible on desktop
  // when there's a path (helpful for distance reading even outside edit mode).
  const segLabels = useMemo(() => {
    const pts: LatLng[] = []
    if (teePos) pts.push(teePos)
    pts.push(...fairwayPath)
    if (greenPos) pts.push(greenPos)
    if (pts.length < 2) return []
    const labels: { lat: number; lng: number; yards: number }[] = []
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      labels.push({
        lat: (a.lat + b.lat) / 2,
        lng: (a.lng + b.lng) / 2,
        yards: Math.round(haversineYards(a.lat, a.lng, b.lat, b.lng)),
      })
    }
    return labels
  }, [teePos, greenPos, fairwayPath])

  return (
    <>
      <Source id="d-fw-bnd" type="geojson" data={fairwayBoundaryFC}>
        <Layer id="d-fw-bnd-fill" type="fill" paint={{ 'fill-color': '#4CAF50', 'fill-opacity': 0.15 }} />
        <Layer id="d-fw-bnd-line" type="line" paint={{ 'line-color': '#4CAF50', 'line-width': 2 }} />
      </Source>
      <Source id="d-green-bnd" type="geojson" data={greenBoundaryFC}>
        <Layer id="d-green-bnd-fill" type="fill" paint={{ 'fill-color': '#4CAF50', 'fill-opacity': 0.25 }} />
        <Layer id="d-green-bnd-line" type="line" paint={{ 'line-color': '#4CAF50', 'line-width': 2 }} />
      </Source>
      <Source id="d-hazards" type="geojson" data={hazardsFC}>
        <Layer id="d-hazards-fill" type="fill" paint={{ 'fill-color': ['get', 'fill'], 'fill-opacity': 0.3 }} />
        <Layer id="d-hazards-line" type="line" paint={{ 'line-color': ['get', 'stroke'], 'line-width': 1.5 }} />
      </Source>
      <Source id="d-centerline" type="geojson" data={centerlineFC}>
        <Layer
          id="d-centerline-line"
          type="line"
          paint={{ 'line-color': '#FFD700', 'line-width': 2, 'line-dasharray': [3, 2] }}
        />
      </Source>

      {Object.entries(teePositions).map(([name, pos]) => {
        const isActive = name === activeTeeName
        const color = TEE_COLORS[name.split(' ')[0]] || '#999'
        const size = isActive ? 24 : 18
        const textColor = color === '#fff' ? '#333' : '#fff'
        const draggable = isActive && editNodes
        return (
          <Marker
            key={name}
            longitude={pos.lng}
            latitude={pos.lat}
            anchor="center"
            draggable={draggable}
            onDragEnd={draggable ? (evt) => {
              const newPos = { lat: evt.lngLat.lat, lng: evt.lngLat.lng }
              setTeePos(newPos)
              setTeePositions({ ...teePositions, [name]: newPos })
              setDirty(true)
              triggerRedraw()
            } : undefined}
          >
            <div
              title={draggable ? `${name} tee — drag to move` : `${name} tee`}
              style={{
                width: size, height: size, borderRadius: '50%',
                background: color, border: '2px solid #fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 'bold', color: textColor,
                opacity: isActive ? 1 : 0.6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                cursor: draggable ? 'move' : 'default',
                pointerEvents: draggable ? 'auto' : 'none',
              }}
            >T</div>
          </Marker>
        )
      })}

      {greenPos && (
        <Marker
          longitude={greenPos.lng}
          latitude={greenPos.lat}
          anchor="bottom"
          draggable={editNodes}
          onDragEnd={editNodes ? (evt) => {
            setGreenPos({ lat: evt.lngLat.lat, lng: evt.lngLat.lng })
            setDirty(true)
            triggerRedraw()
          } : undefined}
        >
          <svg
            width="20"
            height="24"
            viewBox="0 0 20 24"
            style={{
              cursor: editNodes ? 'move' : 'default',
              pointerEvents: editNodes ? 'auto' : 'none',
            }}
          >
            <line x1="4" y1="2" x2="4" y2="22" stroke="#fff" strokeWidth="2" />
            <polygon points="5,2 18,7 5,12" fill="#ef5350" />
            <circle cx="4" cy="22" r="2.5" fill="#fff" stroke="#333" />
          </svg>
        </Marker>
      )}

      {segLabels.map((l, i) => (
        <Marker key={i} longitude={l.lng} latitude={l.lat} anchor="center">
          <div
            style={{
              color: '#FFD700', fontSize: 10, fontWeight: 700,
              textShadow: '0 0 3px #000, 0 0 3px #000',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}
          >{l.yards}y</div>
        </Marker>
      ))}

      {/* Ball position (placed via Strategy → Place Ball, used by caddie calcs) */}
      {ballPos && (
        <Marker longitude={ballPos.lng} latitude={ballPos.lat} anchor="center">
          <div
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: '#FFD700', border: '2px solid #fff',
              boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
        </Marker>
      )}
    </>
  )
}
