import { useMemo, useState } from 'react'
import { Source, Layer, Marker, Popup } from 'react-map-gl/maplibre'
import type { FeatureCollection, Feature, Polygon, LineString, Position } from 'geojson'
import { useCourseMap, HAZARD_COLORS } from './courseMapState'
import type { LatLng } from './courseMapState'
import type { CourseDetail, OSMHole as OSMHoleType } from '../../api'

/**
 * DesktopEditingOverlays — Stage 20g editing surface (drawing tools).
 *
 * Renders only the editing-time overlays that DesktopMapLibreOverlays does NOT
 * render: draggable handles for fairway waypoints + fairway-boundary vertices +
 * green-boundary vertices, in-progress polygon previews while the user is
 * drawing, and unlinked OSM markers with assign-to-hole popups.
 *
 * Read-only overlays (boundaries, hazards, tee/green markers, distance labels)
 * stay in DesktopMapLibreOverlays. Active tee + green-flag drag is handled
 * there too via conditional `draggable` props — keeps the marker singletons
 * single-rendered.
 */

// Type bridge: courseMapState exports OSMHole only as a type. We accept it as-is.
function getUnlinkedOsmHoles(course: CourseDetail | undefined): OSMHoleType[] {
  if (!course?.osm_holes) return []
  const linked = new Set<number>()
  for (const t of course.tees || []) {
    for (const h of t.holes || []) {
      if (h.osm_hole_id) linked.add(h.osm_hole_id)
    }
  }
  return course.osm_holes.filter(oh => !linked.has(oh.id))
}

// Build a closed ring (first==last) for MapLibre Polygon coordinates.
function ringFromLatLng(pts: LatLng[]): Position[] {
  const ring: Position[] = pts.map(p => [p.lng, p.lat])
  if (ring.length >= 3) {
    const f = ring[0]
    const l = ring[ring.length - 1]
    if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  }
  return ring
}

export function DesktopEditingOverlays() {
  const ctx = useCourseMap()
  const {
    drawPanelOpen, activeTool, course, showUnlinkedOsm, currentHole,
    fairwayPath, setFairwayPath,
    fairwayBoundaries, setFairwayBoundaries,
    currentFwBoundary,
    greenBoundary, setGreenBoundary,
    currentHazard, hazardType,
    setDirty, triggerRedraw,
    assignOsmHoleToHole,
  } = ctx
  // Drag handles for fairway path / boundaries / green boundary render only
  // when Edit Nodes is the active tool. Keeps planning workflows safe from
  // accidental drags while the panel stays open.
  const editNodes = drawPanelOpen && activeTool === 'edit-nodes'

  // Local UI state for OSM-assign popups (which marker is open + selected hole)
  const [openOsmPopup, setOpenOsmPopup] = useState<{ id: number; kind: 'tee' | 'green'; lat: number; lng: number } | null>(null)
  const [popupHoleNum, setPopupHoleNum] = useState<number>(1)
  const [popupBusy, setPopupBusy] = useState(false)

  // ── In-progress fairway-boundary preview (filled if 3+ pts, line if 2) ──
  const inProgressFwBoundaryFC = useMemo<FeatureCollection>(() => {
    if (currentFwBoundary.length < 2) return { type: 'FeatureCollection', features: [] }
    const pts = currentFwBoundary
    if (pts.length >= 3) {
      const feature: Feature<Polygon> = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringFromLatLng(pts)] },
        properties: {},
      }
      return { type: 'FeatureCollection', features: [feature] }
    }
    const feature: Feature<LineString> = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.map(p => [p.lng, p.lat]) },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [currentFwBoundary])

  // ── In-progress hazard preview ──
  const inProgressHazardFC = useMemo<FeatureCollection>(() => {
    if (currentHazard.length < 2) return { type: 'FeatureCollection', features: [] }
    const pts = currentHazard
    if (pts.length >= 3) {
      const feature: Feature<Polygon> = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringFromLatLng(pts)] },
        properties: {},
      }
      return { type: 'FeatureCollection', features: [feature] }
    }
    const feature: Feature<LineString> = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.map(p => [p.lng, p.lat]) },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [currentHazard])

  const hazardColor = HAZARD_COLORS[hazardType]?.[0] || '#ffa726'

  // ── Unlinked OSM markers — visible regardless of drawPanelOpen when toggle is on ──
  const unlinkedOsm = useMemo(() => {
    if (!showUnlinkedOsm) return []
    return getUnlinkedOsmHoles(course)
  }, [course, showUnlinkedOsm])

  // OSM dashed centerlines + green outlines for unlinked holes
  const osmCenterlinesFC = useMemo<FeatureCollection>(() => {
    const features: Feature<LineString>[] = []
    for (const oh of unlinkedOsm) {
      if (!oh.waypoints) continue
      try {
        const pts = JSON.parse(oh.waypoints) as number[][]
        if (pts.length < 2) continue
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: pts.map(p => [p[1], p[0]]) },
          properties: { osm_id: oh.id },
        })
      } catch { /* ignore */ }
    }
    return { type: 'FeatureCollection', features }
  }, [unlinkedOsm])

  const osmGreenOutlinesFC = useMemo<FeatureCollection>(() => {
    const features: Feature<Polygon>[] = []
    for (const oh of unlinkedOsm) {
      if (!oh.green_boundary) continue
      try {
        const pts = JSON.parse(oh.green_boundary) as number[][]
        if (pts.length < 3) continue
        const ring: Position[] = pts.map(p => [p[1], p[0]])
        const f = ring[0], l = ring[ring.length - 1]
        if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { osm_id: oh.id },
        })
      } catch { /* ignore */ }
    }
    return { type: 'FeatureCollection', features }
  }, [unlinkedOsm])

  const totalHoles = course?.holes ?? 18

  return (
    <>
      {/* In-progress polygon previews while drawing — only when panel is open */}
      {drawPanelOpen && (
        <>
          <Source id="d-edit-fwbnd-progress" type="geojson" data={inProgressFwBoundaryFC}>
            <Layer
              id="d-edit-fwbnd-progress-fill"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{ 'fill-color': '#4CAF50', 'fill-opacity': 0.1 }}
            />
            <Layer
              id="d-edit-fwbnd-progress-line"
              type="line"
              paint={{ 'line-color': '#4CAF50', 'line-width': 2, 'line-dasharray': [2, 2] }}
            />
          </Source>
          <Source id="d-edit-hazard-progress" type="geojson" data={inProgressHazardFC}>
            <Layer
              id="d-edit-hazard-progress-fill"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{ 'fill-color': hazardColor, 'fill-opacity': 0.15 }}
            />
            <Layer
              id="d-edit-hazard-progress-line"
              type="line"
              paint={{ 'line-color': hazardColor, 'line-width': 2, 'line-dasharray': [2, 2] }}
            />
          </Source>

          {/* Vertex dots for in-progress polygons */}
          {currentFwBoundary.map((p, i) => (
            <Marker key={`fwbnd-prog-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: '#4CAF50', border: '2px solid #fff',
                pointerEvents: 'none',
              }} />
            </Marker>
          ))}
          {currentHazard.map((p, i) => (
            <Marker key={`hzd-prog-${i}`} longitude={p.lng} latitude={p.lat} anchor="center">
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: hazardColor, border: '2px solid #fff',
                pointerEvents: 'none',
              }} />
            </Marker>
          ))}
        </>
      )}

      {/* Drag handles — Edit Nodes mode only */}
      {editNodes && (
        <>
          {/* Fairway waypoint drag handles (gold) */}
          {fairwayPath.map((p, i) => (
            <Marker
              key={`wp-${i}`}
              longitude={p.lng}
              latitude={p.lat}
              anchor="center"
              draggable
              onDrag={evt => {
                const next = [...fairwayPath]
                next[i] = { lat: evt.lngLat.lat, lng: evt.lngLat.lng }
                setFairwayPath(next)
                setDirty(true)
              }}
              onDragEnd={() => triggerRedraw()}
            >
              <div
                onContextMenu={e => {
                  e.preventDefault()
                  const next = [...fairwayPath]
                  next.splice(i, 1)
                  setFairwayPath(next)
                  setDirty(true)
                  triggerRedraw()
                }}
                style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: '#FFD700', border: '2px solid #fff',
                  cursor: 'move',
                }}
                title="Drag to move, right-click to remove"
              />
            </Marker>
          ))}

          {/* Fairway boundary vertex handles (green dots) per polygon */}
          {fairwayBoundaries.map((poly, polyIdx) =>
            poly.map((p, i) => (
              <Marker
                key={`fwv-${polyIdx}-${i}`}
                longitude={p.lng}
                latitude={p.lat}
                anchor="center"
                draggable
                onDrag={evt => {
                  const next = fairwayBoundaries.map(b => [...b])
                  next[polyIdx][i] = { lat: evt.lngLat.lat, lng: evt.lngLat.lng }
                  setFairwayBoundaries(next)
                  setDirty(true)
                }}
                onDragEnd={() => triggerRedraw()}
              >
                <div
                  onContextMenu={e => {
                    e.preventDefault()
                    const next = fairwayBoundaries.map(b => [...b])
                    next[polyIdx].splice(i, 1)
                    if (next[polyIdx].length === 0) next.splice(polyIdx, 1)
                    setFairwayBoundaries(next)
                    setDirty(true)
                    triggerRedraw()
                  }}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: '#4CAF50', border: '2px solid #fff',
                    cursor: 'move',
                  }}
                  title="Drag to move, right-click to remove"
                />
              </Marker>
            ))
          )}

          {/* Green boundary vertex handles (smaller green dots) */}
          {greenBoundary.map((p, i) => (
            <Marker
              key={`gv-${i}`}
              longitude={p.lng}
              latitude={p.lat}
              anchor="center"
              draggable
              onDrag={evt => {
                const next = [...greenBoundary]
                next[i] = { lat: evt.lngLat.lat, lng: evt.lngLat.lng }
                setGreenBoundary(next)
                setDirty(true)
              }}
              onDragEnd={() => triggerRedraw()}
            >
              <div
                onContextMenu={e => {
                  e.preventDefault()
                  const next = [...greenBoundary]
                  next.splice(i, 1)
                  setGreenBoundary(next)
                  setDirty(true)
                  triggerRedraw()
                }}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#4CAF50', border: '1px solid #fff',
                  cursor: 'move',
                }}
                title="Drag to move, right-click to remove"
              />
            </Marker>
          ))}
        </>
      )}

      {/* Unlinked OSM features — independent of drawPanelOpen, gated by toggle */}
      <Source id="d-osm-centerlines" type="geojson" data={osmCenterlinesFC}>
        <Layer
          id="d-osm-centerlines-line"
          type="line"
          paint={{ 'line-color': '#FF7043', 'line-width': 2, 'line-dasharray': [3, 6], 'line-opacity': 0.7 }}
        />
      </Source>
      <Source id="d-osm-greens" type="geojson" data={osmGreenOutlinesFC}>
        <Layer
          id="d-osm-greens-fill"
          type="fill"
          paint={{ 'fill-color': '#FF7043', 'fill-opacity': 0.1 }}
        />
        <Layer
          id="d-osm-greens-line"
          type="line"
          paint={{ 'line-color': '#FF7043', 'line-width': 1.5, 'line-dasharray': [3, 5] }}
        />
      </Source>

      {unlinkedOsm.map(oh => (
        <UnlinkedOsmMarkers
          key={oh.id}
          osm={oh}
          onOpenPopup={(kind, lat, lng) => {
            setOpenOsmPopup({ id: oh.id, kind, lat, lng })
            setPopupHoleNum(oh.hole_number ?? currentHole)
            setPopupBusy(false)
          }}
        />
      ))}

      {openOsmPopup && (() => {
        const oh = unlinkedOsm.find(u => u.id === openOsmPopup.id)
        if (!oh) return null
        const label = openOsmPopup.kind === 'tee' ? 'Tee' : 'Green'
        const holeNumLabel = oh.hole_number ? ` ${oh.hole_number}` : ''
        const parLabel = oh.par ? ` · par ${oh.par}` : ''
        return (
          <Popup
            longitude={openOsmPopup.lng}
            latitude={openOsmPopup.lat}
            anchor="bottom"
            onClose={() => setOpenOsmPopup(null)}
            closeButton
            closeOnClick={false}
            offset={14}
          >
            <div style={{ minWidth: 180, fontSize: 13, color: 'var(--text)' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                OSM Hole{holeNumLabel} · {label}{parLabel}
              </div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                Assign to course hole
              </label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select
                  value={popupHoleNum}
                  onChange={e => setPopupHoleNum(Number(e.target.value))}
                  style={{
                    flex: 1, fontSize: 13, padding: '4px 6px',
                    background: 'var(--bg)', color: 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 4, outline: 'none',
                  }}
                >
                  {Array.from({ length: totalHoles }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <button
                  disabled={popupBusy}
                  onClick={async () => {
                    setPopupBusy(true)
                    try {
                      await assignOsmHoleToHole(oh.id, popupHoleNum, true)
                      setOpenOsmPopup(null)
                    } finally {
                      setPopupBusy(false)
                    }
                  }}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '4px 10px',
                    cursor: popupBusy ? 'wait' : 'pointer',
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 4,
                  }}
                >
                  {popupBusy ? '…' : 'Assign'}
                </button>
              </div>
            </div>
          </Popup>
        )
      })()}
    </>
  )
}

function UnlinkedOsmMarkers({
  osm,
  onOpenPopup,
}: {
  osm: OSMHoleType
  onOpenPopup: (kind: 'tee' | 'green', lat: number, lng: number) => void
}) {
  const OSM_COLOR = '#FF7043'
  return (
    <>
      {osm.tee_lat != null && osm.tee_lng != null && (
        <Marker longitude={osm.tee_lng} latitude={osm.tee_lat} anchor="center">
          <div
            title={`OSM Tee${osm.hole_number ? ` (hole ${osm.hole_number})` : ''} — click to assign`}
            onClick={() => onOpenPopup('tee', osm.tee_lat!, osm.tee_lng!)}
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: OSM_COLOR, border: '2px dashed #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 'bold', color: '#fff',
              opacity: 0.85, cursor: 'pointer',
            }}
          >T</div>
        </Marker>
      )}
      {osm.green_lat != null && osm.green_lng != null && (
        <Marker longitude={osm.green_lng} latitude={osm.green_lat} anchor="center">
          <div
            title={`OSM Green${osm.hole_number ? ` (hole ${osm.hole_number})` : ''} — click to assign`}
            onClick={() => onOpenPopup('green', osm.green_lat!, osm.green_lng!)}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: OSM_COLOR, border: '2px dashed #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 'bold', color: '#fff',
              opacity: 0.85, cursor: 'pointer',
            }}
          >G</div>
        </Marker>
      )}
    </>
  )
}
