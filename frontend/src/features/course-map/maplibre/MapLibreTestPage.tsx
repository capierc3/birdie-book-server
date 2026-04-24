import { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Map, Marker, Source, Layer } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import type { FeatureCollection, Feature, Polygon, LineString, Position } from 'geojson'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useCourse } from '../../../api'
import { parseHoleData, HAZARD_COLORS } from '../courseMapState'
import type { LatLng } from '../courseMapState'
import { bearing as computeBearing } from '../geoUtils'
import 'maplibre-gl/dist/maplibre-gl.css'
import s from './MapLibreTestPage.module.css'

/**
 * MapLibreTestPage — Stage 20a/b/c sandbox.
 *
 * Parallel route at /maplibre-test/:courseId/:hole. Renders satellite tiles
 * with bearing/pitch sliders (20a), OSM-derived overlays — fairway boundary,
 * green boundary, hazards by type, fairway centerline (20b), and auto-orient
 * tee→green-up + tee-fallback chain on hole change (20c). Read-only; drawing
 * tools come in a later stage.
 */

const DEFAULT_PITCH = 70

type TeeSource = 'tee' | 'prev-green' | 'none'

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}

const FLAG_SVG = (
  <svg width="20" height="24" viewBox="0 0 20 24" className={s.greenMarker}>
    <line x1="4" y1="2" x2="4" y2="22" stroke="#fff" strokeWidth="2" />
    <polygon points="5,2 18,7 5,12" fill="#ef5350" />
    <circle cx="4" cy="22" r="2.5" fill="#fff" stroke="#333" />
  </svg>
)

const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] }

// MapLibre rings: array of [lng,lat]; first/last must match for a closed ring.
function ringFromLatLng(pts: LatLng[]): Position[] {
  const ring: Position[] = pts.map(p => [p.lng, p.lat])
  if (ring.length >= 3) {
    const first = ring[0]
    const last = ring[ring.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  }
  return ring
}

export function MapLibreTestPage() {
  const { courseId: courseIdParam, hole: holeParam } = useParams<{ courseId: string; hole: string }>()
  const navigate = useNavigate()
  const courseId = courseIdParam ? Number(courseIdParam) : undefined
  const holeNumber = holeParam ? Number(holeParam) : 1

  const { data: course } = useCourse(courseId)
  const totalHoles = course?.holes ?? 18

  // Pick the first tee that actually has GPS for this hole (default tee might not).
  const teeId = useMemo(() => {
    if (!course?.tees?.length) return undefined
    const withData = course.tees.find(t =>
      t.holes?.some(h => h.hole_number === holeNumber && h.tee_lat != null && h.tee_lng != null)
    )
    return (withData ?? course.tees[0]).id
  }, [course, holeNumber])

  const teeName = useMemo(() => {
    return course?.tees?.find(t => t.id === teeId)?.tee_name
  }, [course, teeId])

  const parsed = useMemo(() => {
    if (!course) return null
    return parseHoleData(course, holeNumber, teeId)
  }, [course, holeNumber, teeId])

  // ── Tee-fallback chain (20c) ─────────────────────────────────────────────
  // Order: tee position → previous hole's green → none (north-up).
  // "First-shot from any round" fallback comes when we port to live UI that
  // already has round context — sandbox doesn't have it.
  const prevHoleGreen = useMemo<LatLng | null>(() => {
    if (!course) return null
    const prevNum = holeNumber > 1 ? holeNumber - 1 : totalHoles
    const prev = parseHoleData(course, prevNum, teeId)
    return prev.greenPos ?? null
  }, [course, holeNumber, totalHoles, teeId])

  const { effectiveTee, teeSource } = useMemo<{ effectiveTee: LatLng | null; teeSource: TeeSource }>(() => {
    if (parsed?.teePos) return { effectiveTee: parsed.teePos, teeSource: 'tee' }
    if (prevHoleGreen) return { effectiveTee: prevHoleGreen, teeSource: 'prev-green' }
    return { effectiveTee: null, teeSource: 'none' }
  }, [parsed, prevHoleGreen])

  // ── Overlay GeoJSON ──
  const fairwayBoundaryFC = useMemo<FeatureCollection>(() => {
    if (!parsed?.fairwayBoundaries.length) return EMPTY_FC
    const features: Feature<Polygon>[] = parsed.fairwayBoundaries
      .filter(poly => poly.length >= 3)
      .map(poly => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ringFromLatLng(poly)] },
        properties: {},
      }))
    return { type: 'FeatureCollection', features }
  }, [parsed])

  const greenBoundaryFC = useMemo<FeatureCollection>(() => {
    if (!parsed?.greenBoundary.length || parsed.greenBoundary.length < 3) return EMPTY_FC
    const feature: Feature<Polygon> = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ringFromLatLng(parsed.greenBoundary)] },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [parsed])

  const hazardsFC = useMemo<FeatureCollection>(() => {
    if (!parsed?.hazards.length) return EMPTY_FC
    const features: Feature<Polygon>[] = parsed.hazards
      .filter(h => !h._deleted && h.boundary.length >= 3)
      .map(h => {
        const [fill, stroke] = HAZARD_COLORS[h.hazard_type] ?? ['#999', '#666']
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [ringFromLatLng(h.boundary)] },
          properties: { fill, stroke, hazard_type: h.hazard_type, name: h.name ?? '' },
        }
      })
    return { type: 'FeatureCollection', features }
  }, [parsed])

  const centerlineFC = useMemo<FeatureCollection>(() => {
    if (!parsed) return EMPTY_FC
    const pts: Position[] = []
    if (parsed.teePos) pts.push([parsed.teePos.lng, parsed.teePos.lat])
    parsed.fairwayPath.forEach(p => pts.push([p.lng, p.lat]))
    if (parsed.greenPos) pts.push([parsed.greenPos.lng, parsed.greenPos.lat])
    if (pts.length < 2) return EMPTY_FC
    const feature: Feature<LineString> = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts },
      properties: {},
    }
    return { type: 'FeatureCollection', features: [feature] }
  }, [parsed])

  // Bearing from effective-tee → green (drives auto-orient).
  const teeToGreenBearingDeg = useMemo(() => {
    if (!effectiveTee || !parsed?.greenPos) return null
    const rad = computeBearing(effectiveTee.lat, effectiveTee.lng, parsed.greenPos.lat, parsed.greenPos.lng)
    return (rad * 180) / Math.PI
  }, [effectiveTee, parsed])

  // Initial center: effective-tee → green → course center → fallback
  const initialCenter = useMemo<{ lng: number; lat: number }>(() => {
    if (effectiveTee) return { lng: effectiveTee.lng, lat: effectiveTee.lat }
    if (parsed?.greenPos) return { lng: parsed.greenPos.lng, lat: parsed.greenPos.lat }
    if (course?.lat && course?.lng) return { lng: course.lng, lat: course.lat }
    return { lng: -83.5, lat: 42.7 }
  }, [effectiveTee, parsed, course])

  // Controlled view state — sliders + user pan/zoom share the same source of truth
  const [viewState, setViewState] = useState({
    longitude: initialCenter.lng,
    latitude: initialCenter.lat,
    zoom: 17,
    bearing: 0,
    pitch: 0,
  })
  const [showOverlays, setShowOverlays] = useState(true)
  const [autoOrient, setAutoOrient] = useState(true)

  // Auto-orient on hole change: recenter, set bearing tee→green, apply default pitch.
  // North-up if no bearing is computable (no tee + no fallback).
  useEffect(() => {
    if (!autoOrient) {
      setViewState(v => ({ ...v, longitude: initialCenter.lng, latitude: initialCenter.lat }))
      return
    }
    setViewState(v => ({
      ...v,
      longitude: initialCenter.lng,
      latitude: initialCenter.lat,
      bearing: teeToGreenBearingDeg ?? 0,
      pitch: teeToGreenBearingDeg != null ? DEFAULT_PITCH : 0,
    }))
  }, [initialCenter.lng, initialCenter.lat, teeToGreenBearingDeg, autoOrient])

  const orientTeeUp = useCallback(() => {
    if (teeToGreenBearingDeg == null) return
    setViewState(v => ({ ...v, bearing: teeToGreenBearingDeg, pitch: DEFAULT_PITCH }))
  }, [teeToGreenBearingDeg])

  const resetView = useCallback(() => {
    setViewState(v => ({ ...v, bearing: 0, pitch: 0 }))
  }, [])

  const goPrev = () => navigate(`/maplibre-test/${courseId}/${holeNumber > 1 ? holeNumber - 1 : totalHoles}`)
  const goNext = () => navigate(`/maplibre-test/${courseId}/${holeNumber < totalHoles ? holeNumber + 1 : 1}`)

  const overlayCounts = parsed
    ? {
        fwBnd: parsed.fairwayBoundaries.filter(p => p.length >= 3).length,
        green: parsed.greenBoundary.length >= 3 ? 1 : 0,
        hazards: parsed.hazards.filter(h => !h._deleted && h.boundary.length >= 3).length,
        centerline: (parsed.teePos && parsed.greenPos) || parsed.fairwayPath.length >= 1 ? 1 : 0,
      }
    : null

  return (
    <div className={s.layout}>
      <div className={s.mapContainer}>
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle={SATELLITE_STYLE}
          maxPitch={85}
          style={{ width: '100%', height: '100%' }}
          attributionControl={false}
        >
          {showOverlays && (
            <>
              <Source id="fw-bnd" type="geojson" data={fairwayBoundaryFC}>
                <Layer id="fw-bnd-fill" type="fill" paint={{ 'fill-color': '#4CAF50', 'fill-opacity': 0.15 }} />
                <Layer id="fw-bnd-line" type="line" paint={{ 'line-color': '#4CAF50', 'line-width': 2 }} />
              </Source>
              <Source id="green-bnd" type="geojson" data={greenBoundaryFC}>
                <Layer id="green-bnd-fill" type="fill" paint={{ 'fill-color': '#4CAF50', 'fill-opacity': 0.25 }} />
                <Layer id="green-bnd-line" type="line" paint={{ 'line-color': '#4CAF50', 'line-width': 2 }} />
              </Source>
              <Source id="hazards" type="geojson" data={hazardsFC}>
                <Layer
                  id="hazards-fill"
                  type="fill"
                  paint={{ 'fill-color': ['get', 'fill'], 'fill-opacity': 0.3 }}
                />
                <Layer
                  id="hazards-line"
                  type="line"
                  paint={{ 'line-color': ['get', 'stroke'], 'line-width': 1.5 }}
                />
              </Source>
              <Source id="centerline" type="geojson" data={centerlineFC}>
                <Layer
                  id="centerline-line"
                  type="line"
                  paint={{
                    'line-color': '#FFD700',
                    'line-width': 2,
                    'line-dasharray': [3, 2],
                  }}
                />
              </Source>
            </>
          )}
          {parsed?.teePos && (
            <Marker longitude={parsed.teePos.lng} latitude={parsed.teePos.lat} anchor="center">
              <div className={s.teeMarker}>T</div>
            </Marker>
          )}
          {parsed?.greenPos && (
            <Marker longitude={parsed.greenPos.lng} latitude={parsed.greenPos.lat} anchor="bottom">
              {FLAG_SVG}
            </Marker>
          )}
        </Map>
      </div>

      <Link to={courseId ? `/courses/${courseId}/map` : '/courses'} className={s.backBtn}>
        <ArrowLeft size={14} /> Back
      </Link>

      <div className={s.toolbar}>
        <button className={s.toolbarBtn} onClick={goPrev} title="Previous hole">‹</button>
        <span className={s.holeLabel}>Hole {holeNumber}</span>
        <button className={s.toolbarBtn} onClick={goNext} title="Next hole">›</button>
        <span style={{ opacity: 0.5 }}>·</span>
        {courseId && (
          <a
            href={`/courses/${courseId}/map`}
            target="_blank"
            rel="noreferrer"
            className={s.toolbarBtn}
            title="Open this course in the legacy Leaflet map (new tab) for side-by-side comparison"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
          >
            <ExternalLink size={11} /> Leaflet
          </a>
        )}
      </div>

      <div className={s.controls}>
        <div className={s.controlRow}>
          <span className={s.controlLabel}>Bearing</span>
          <input
            className={s.slider}
            type="range"
            min={0}
            max={360}
            step={1}
            value={viewState.bearing}
            onChange={e => setViewState(v => ({ ...v, bearing: Number(e.target.value) }))}
          />
          <span className={s.controlValue}>{Math.round(viewState.bearing)}°</span>
        </div>
        <div className={s.controlRow}>
          <span className={s.controlLabel}>Pitch</span>
          <input
            className={s.slider}
            type="range"
            min={0}
            max={85}
            step={1}
            value={viewState.pitch}
            onChange={e => setViewState(v => ({ ...v, pitch: Number(e.target.value) }))}
          />
          <span className={s.controlValue}>{Math.round(viewState.pitch)}°</span>
        </div>
        <div className={s.actionRow}>
          <button
            className={s.actionBtn}
            onClick={orientTeeUp}
            disabled={teeToGreenBearingDeg == null}
            title={teeToGreenBearingDeg == null ? 'No tee + green bearing available' : 'Rotate so tee→green points up + tilt'}
          >
            Tee → Green up
          </button>
          <button className={s.actionBtn} onClick={resetView}>Reset view</button>
          <button
            className={s.actionBtn}
            onClick={() => setAutoOrient(v => !v)}
            title="Auto-orient tee→green up when changing holes"
          >
            Auto-orient: {autoOrient ? 'on' : 'off'}
          </button>
          <button
            className={s.actionBtn}
            onClick={() => setShowOverlays(v => !v)}
            title="Toggle fairway, green, hazards, centerline"
          >
            {showOverlays ? 'Hide' : 'Show'} overlays
          </button>
        </div>
        <div className={s.infoLine}>
          {course ? course.display_name : 'Loading…'}
          {teeName && <> · {teeName} tees</>}
          {teeToGreenBearingDeg != null && <> · bearing {Math.round(teeToGreenBearingDeg)}°</>}
          {teeSource === 'prev-green' && <> · ⚠ tee fallback: prev green</>}
          {teeSource === 'none' && <> · ⚠ tee fallback: north-up</>}
          {parsed && !parsed.greenPos && <> · ⚠ no green data</>}
        </div>
        {overlayCounts && (
          <div className={s.infoLine}>
            overlays: fw-bnd {overlayCounts.fwBnd} · green {overlayCounts.green} · hazards {overlayCounts.hazards} · centerline {overlayCounts.centerline}
          </div>
        )}
      </div>
    </div>
  )
}
