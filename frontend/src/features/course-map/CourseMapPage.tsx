import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Map } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useCourse, put, post, del, get, linkOsmHole } from '../../api'
import type { CourseDetail, RoundDetail } from '../../api'
import { useToast } from '../../components'
import { useIsMobile } from '../../hooks/useMediaQuery'
import { useCourseStrategy } from './useCourseStrategy'
import { CourseMapContext, parseHoleData } from './courseMapState'
import type { CourseMapContextType, LatLng, DrawTool, HazardType, EditorHazard, PanelId } from './courseMapState'
import { setClubColorCache } from './clubColors'
import { DesktopMapLibreOverlays } from './DesktopMapLibreOverlays'
import { DesktopEditingOverlays } from './DesktopEditingOverlays'
import { DesktopStrategyOverlays } from './DesktopStrategyOverlays'
import { DesktopPlanAimOverlay } from './DesktopPlanAimOverlay'
import { EditHolePanel } from './EditHolePanel'
import { DrawToolsPanel } from './DrawToolsPanel'
import { ScorecardPanel } from './ScorecardPanel'
import { OverviewPanel } from './OverviewPanel'
import { ShotsPanel } from './ShotsPanel'
import { DesktopShotOverlays } from './DesktopShotOverlays'
import { InsightsPanel } from './InsightsPanel'
import { StrategyToolsPanel } from './StrategyToolsPanel'
import { PlanningPanel } from './PlanningPanel'
import { DesktopPlanOverlays } from './DesktopPlanOverlays'
import { DataImportPanel } from './DataImportPanel'
import { MobileHoleViewer } from './mobile/MobileHoleViewer'
import { bearing as computeBearing, haversineYards, pointToSegmentDist } from './geoUtils'
import type { OSMHole } from '../../api'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import s from './CourseMapPage.module.css'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre satellite style — same ArcGIS tiles we used with Leaflet, just
// declared as a MapLibre StyleSpecification.
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

const DEFAULT_PITCH = 60  // perspective tilt when "Player view" is on

// User-toggled view orientation, persisted to localStorage so the choice
// survives page reloads. North-up + flat is the safe default; the toggle
// flips to tee→green-up + tilted on demand.
type CameraOrient = 'north-up' | 'green-up'
type CameraTilt = 'flat' | 'perspective'

// Re-export PanelId for external use
export type { PanelId }

// ── Toolbar icon SVGs ──
const PANEL_ICONS: Record<PanelId, { title: string; svg: React.ReactNode }> = {
  scorecard: {
    title: 'Scorecard',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>,
  },
  overview: {
    title: 'Hole Overview',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
  },
  shots: {
    title: 'Shots',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" /></svg>,
  },
  insights: {
    title: 'Strategy Insights',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21h6" /><path d="M12 3a6 6 0 014 10.5V17H8v-3.5A6 6 0 0112 3z" /></svg>,
  },
  strategy: {
    title: 'Strategy Tools',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>,
  },
  planning: {
    title: 'Round Planning',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>,
  },
  hole: {
    title: 'Edit Hole',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V3l12 5-12 5" /></svg>,
  },
  draw: {
    title: 'Drawing Tools',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
  },
  data: {
    title: 'Data Import',
    svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4" /><path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" /></svg>,
  },
}

const ANALYSIS_PANELS: PanelId[] = ['scorecard', 'overview', 'shots', 'insights', 'strategy', 'planning']
const EDITING_PANELS: PanelId[] = ['hole', 'draw', 'data']
const MUTUALLY_EXCLUSIVE: [PanelId, PanelId][] = [['draw', 'strategy']]

// ── Map auto-center ──
/**
 * Resolve the best center/bearing for a hole using the tee-fallback chain:
 *   1. Course tee GPS for the active tee
 *   2. First-shot GPS from any played round on this hole
 *   3. Previous hole's green (lets the camera align loosely with hole flow)
 *   4. Course center
 *
 * Returns the chosen center plus a bearing tee→green when both are known
 * (used when the user has Green-up orientation enabled).
 */
function resolveHoleCamera(
  course: CourseDetail | undefined,
  currentHole: number,
  teeId: number | undefined,
  allRoundDetails: RoundDetail[],
): { center: { lat: number; lng: number } | null; bearingDeg: number | null; greenLat: number | null; greenLng: number | null } {
  if (!course) return { center: null, bearingDeg: null, greenLat: null, greenLng: null }

  const activeTee = course.tees?.find(t => t.id === teeId) ?? course.tees?.[0]
  const hole = activeTee?.holes?.find(h => h.hole_number === currentHole)

  const greenLat = hole?.flag_lat ?? null
  const greenLng = hole?.flag_lng ?? null

  // 1. Course tee GPS
  if (hole?.tee_lat && hole?.tee_lng) {
    let bearingDeg: number | null = null
    if (greenLat != null && greenLng != null) {
      bearingDeg = (computeBearing(hole.tee_lat, hole.tee_lng, greenLat, greenLng) * 180) / Math.PI
    }
    return { center: { lat: hole.tee_lat, lng: hole.tee_lng }, bearingDeg, greenLat, greenLng }
  }

  // 2. First-shot GPS from played rounds
  for (const rd of allRoundDetails) {
    const rh = rd.holes?.find(h => h.hole_number === currentHole)
    const firstShot = rh?.shots?.find(s => s.shot_number === 1)
    if (firstShot?.start_lat && firstShot?.start_lng) {
      let bearingDeg: number | null = null
      if (greenLat != null && greenLng != null) {
        bearingDeg = (computeBearing(firstShot.start_lat, firstShot.start_lng, greenLat, greenLng) * 180) / Math.PI
      }
      return { center: { lat: firstShot.start_lat, lng: firstShot.start_lng }, bearingDeg, greenLat, greenLng }
    }
  }

  // 3. Previous hole's green
  const prevHole = activeTee?.holes?.find(h => h.hole_number === currentHole - 1)
  if (prevHole?.flag_lat && prevHole?.flag_lng) {
    return { center: { lat: prevHole.flag_lat, lng: prevHole.flag_lng }, bearingDeg: null, greenLat, greenLng }
  }

  // 4. Course center
  if (course.lat && course.lng) {
    return { center: { lat: course.lat, lng: course.lng }, bearingDeg: null, greenLat, greenLng }
  }

  return { center: null, bearingDeg: null, greenLat, greenLng }
}

// ── Main page (routes mobile vs desktop) ──
export function CourseMapPage() {
  const isMobile = useIsMobile()
  if (isMobile) return <MobileHoleViewer />
  return <DesktopCourseMapPage />
}

function DesktopCourseMapPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const courseId = id ? Number(id) : undefined

  const { data: course } = useCourse(courseId)
  const { data: strategy } = useCourseStrategy(courseId)
  const totalHoles = course?.holes ?? 18

  // Sync club colors from strategy data
  useEffect(() => {
    if (strategy?.player?.clubs) setClubColorCache(strategy.player.clubs)
  }, [strategy])

  // Core UI state
  const [currentHole, setCurrentHole] = useState(1)
  const [openPanels, setOpenPanels] = useState<Set<PanelId>>(new Set())
  const [teeId, setTeeId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('birdie_book_default_tee')
    return saved ? Number(saved) : undefined
  })

  // Editor geometry state
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  const [drawPanelOpen, setDrawPanelOpen] = useState(false)
  const [activeTool, setActiveTool] = useState<DrawTool | null>(null)
  const [hazardType, setHazardType] = useState<HazardType>('bunker')
  const [teePos, setTeePos] = useState<LatLng | null>(null)
  const [greenPos, setGreenPos] = useState<LatLng | null>(null)
  const [teePositions, setTeePositions] = useState<Record<string, LatLng>>({})
  const [fairwayPath, setFairwayPath] = useState<LatLng[]>([])
  const [fairwayBoundaries, setFairwayBoundaries] = useState<LatLng[][]>([])
  const [currentFwBoundary, setCurrentFwBoundary] = useState<LatLng[]>([])
  const [greenBoundary, setGreenBoundary] = useState<LatLng[]>([])
  const [hazards, setHazards] = useState<EditorHazard[]>([])
  const [currentHazard, setCurrentHazard] = useState<LatLng[]>([])
  const [ballPos, setBallPos] = useState<LatLng | null>(null)
  const [redrawKey, setRedrawKey] = useState(0)

  // OSM linking
  const [showUnlinkedOsm, setShowUnlinkedOsm] = useState(false)

  // Strategy tools
  const [activeStrategyTool, setActiveStrategyTool] = useState('cone')

  // Planning
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null)
  const [planAiming, setPlanAiming] = useState<{ club: string; ballPos: LatLng } | null>(null)

  // Shared round view state (used by scorecard, overview, shots)
  const [viewMode, setViewMode] = useState<'historic' | number>('historic')
  const [roundDetail, setRoundDetail] = useState<RoundDetail | null>(null)
  const [allRoundDetails, setAllRoundDetails] = useState<RoundDetail[]>([])

  // Form values ref (shared with EditHolePanel via context)
  const formValuesRef = useRef({ par: '', yardage: '', handicap: '' })

  // ── MapLibre camera state (Stage 20f) ──
  const [orient, setOrient] = useState<CameraOrient>(() =>
    (localStorage.getItem('birdie_book_camera_orient') as CameraOrient | null) ?? 'north-up'
  )
  const [tilt, setTilt] = useState<CameraTilt>(() =>
    (localStorage.getItem('birdie_book_camera_tilt') as CameraTilt | null) ?? 'flat'
  )
  useEffect(() => { localStorage.setItem('birdie_book_camera_orient', orient) }, [orient])
  useEffect(() => { localStorage.setItem('birdie_book_camera_tilt', tilt) }, [tilt])

  const [viewState, setViewState] = useState({
    longitude: -83.5,
    latitude: 42.7,
    zoom: 17,
    bearing: 0,
    pitch: 0,
  })

  const cameraResolved = useMemo(
    () => resolveHoleCamera(course, currentHole, teeId, allRoundDetails),
    [course, currentHole, teeId, allRoundDetails],
  )

  // ── Drawing tool map handlers (Stage 20g) ──
  const OSM_SNAP_YARDS = 30

  const onMapClick = useCallback((e: MapLayerMouseEvent) => {
    if (!drawPanelOpen || !activeTool) return
    const { lat, lng } = e.lngLat

    // Helper: find closest unlinked OSM hole within snap radius
    const getUnlinkedOsm = (): OSMHole[] => {
      if (!course?.osm_holes) return []
      const linked = new Set<number>()
      for (const t of course.tees || []) {
        for (const h of t.holes || []) {
          if (h.osm_hole_id) linked.add(h.osm_hole_id)
        }
      }
      return course.osm_holes.filter(oh => !linked.has(oh.id))
    }

    switch (activeTool) {
      case 'tee': {
        let newPos: LatLng = { lat, lng }
        let snappedOsmId: number | null = null
        const unlinked = getUnlinkedOsm()
        let bestDist = OSM_SNAP_YARDS
        for (const oh of unlinked) {
          if (oh.tee_lat == null || oh.tee_lng == null) continue
          const d = haversineYards(lat, lng, oh.tee_lat, oh.tee_lng)
          if (d < bestDist) {
            bestDist = d
            newPos = { lat: oh.tee_lat, lng: oh.tee_lng }
            snappedOsmId = oh.id
          }
        }
        setTeePos(newPos)
        const activeTee = course?.tees?.find(t => t.id === teeId)
        if (activeTee) {
          setTeePositions({ ...teePositions, [activeTee.tee_name]: newPos })
        }
        if (snappedOsmId != null) {
          assignOsmHoleToHole(snappedOsmId, currentHole, false)
        }
        break
      }
      case 'green': {
        let newPos: LatLng = { lat, lng }
        let snappedOsmId: number | null = null
        const unlinked = getUnlinkedOsm()
        let bestDist = OSM_SNAP_YARDS
        for (const oh of unlinked) {
          if (oh.green_lat == null || oh.green_lng == null) continue
          const d = haversineYards(lat, lng, oh.green_lat, oh.green_lng)
          if (d < bestDist) {
            bestDist = d
            newPos = { lat: oh.green_lat, lng: oh.green_lng }
            snappedOsmId = oh.id
          }
        }
        setGreenPos(newPos)
        if (snappedOsmId != null) {
          assignOsmHoleToHole(snappedOsmId, currentHole, false)
        }
        break
      }
      case 'fairway': {
        if (fairwayPath.length === 0) {
          setFairwayPath([{ lat, lng }])
        } else {
          // Smart insertion: pick the segment in the full tee→path→green chain
          // that's closest to the click, insert between those points.
          const allPts: LatLng[] = []
          if (teePos) allPts.push(teePos)
          allPts.push(...fairwayPath)
          if (greenPos) allPts.push(greenPos)
          let bestIdx = fairwayPath.length
          let bestDist = Infinity
          for (let i = 0; i < allPts.length - 1; i++) {
            const d = pointToSegmentDist(lat, lng, allPts[i].lat, allPts[i].lng, allPts[i + 1].lat, allPts[i + 1].lng)
            if (d < bestDist) {
              bestDist = d
              bestIdx = teePos ? i : i + 1
            }
          }
          const newPath = [...fairwayPath]
          const insertAt = Math.max(0, Math.min(bestIdx, newPath.length))
          newPath.splice(insertAt, 0, { lat, lng })
          setFairwayPath(newPath)
        }
        break
      }
      case 'fairway-boundary':
        setCurrentFwBoundary([...currentFwBoundary, { lat, lng }])
        break
      case 'green-boundary':
        setGreenBoundary([...greenBoundary, { lat, lng }])
        break
      case 'hazard':
        setCurrentHazard([...currentHazard, { lat, lng }])
        break
    }

    setDirty(true)
    triggerRedraw()
  }, [
    drawPanelOpen, activeTool, course, teeId, currentHole,
    teePos, greenPos, teePositions, fairwayPath, currentFwBoundary, greenBoundary, currentHazard,
  ])

  const onMapDblClick = useCallback((e: MapLayerMouseEvent) => {
    if (!drawPanelOpen) return
    if (activeTool === 'fairway-boundary' && currentFwBoundary.length >= 3) {
      e.preventDefault()
      finishFwBoundary()
    }
    if (activeTool === 'hazard' && currentHazard.length >= 3) {
      e.preventDefault()
      finishHazard()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawPanelOpen, activeTool, currentFwBoundary.length, currentHazard.length])

  const onMapContextMenu = useCallback((e: MapLayerMouseEvent) => {
    if (!drawPanelOpen) return
    const features = e.features ?? []
    if (features.length === 0) return
    e.preventDefault()
    const top = features[0]
    const idxRaw = top.properties?.idx
    const idx = typeof idxRaw === 'number' ? idxRaw : Number(idxRaw)
    if (!Number.isFinite(idx)) return
    if (top.layer.id === 'd-hazards-fill') {
      const next = [...hazards]
      if (next[idx]?.id) next[idx] = { ...next[idx], _deleted: true }
      else next.splice(idx, 1)
      setHazards(next)
      setDirty(true)
      triggerRedraw()
    } else if (top.layer.id === 'd-fw-bnd-fill') {
      const next = [...fairwayBoundaries]
      next.splice(idx, 1)
      setFairwayBoundaries(next)
      setDirty(true)
      triggerRedraw()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawPanelOpen, hazards, fairwayBoundaries])

  // Layer ids that should be queryable for right-click delete
  const interactiveLayerIds = useMemo(
    () => drawPanelOpen ? ['d-hazards-fill', 'd-fw-bnd-fill'] : [],
    [drawPanelOpen],
  )

  // Apply camera prefs whenever the resolved hole camera or user toggles change.
  // Pan/zoom from the user is preserved between hole changes since we only
  // overwrite the lng/lat/bearing/pitch fields here, not zoom.
  useEffect(() => {
    if (!cameraResolved.center) return
    const wantBearing = orient === 'green-up' && cameraResolved.bearingDeg != null
      ? cameraResolved.bearingDeg
      : 0
    const wantPitch = tilt === 'perspective' ? DEFAULT_PITCH : 0
    setViewState(v => ({
      ...v,
      longitude: cameraResolved.center!.lng,
      latitude: cameraResolved.center!.lat,
      bearing: wantBearing,
      pitch: wantPitch,
    }))
  }, [cameraResolved, orient, tilt])

  // Tee default + persistence
  useEffect(() => {
    if (!course?.tees?.length) return
    if (teeId && course.tees.some((t) => t.id === teeId)) return
    setTeeId(course.tees[0].id)
  }, [course, teeId])

  useEffect(() => {
    if (teeId !== undefined) localStorage.setItem('birdie_book_default_tee', String(teeId))
  }, [teeId])

  // Parse initial hole and round from URL
  useEffect(() => {
    const h = searchParams.get('hole')
    if (h) { const n = Number(h); if (n >= 1 && n <= totalHoles) setCurrentHole(n) }
    const r = searchParams.get('round')
    if (r) {
      const roundId = Number(r)
      setViewMode(roundId)
      setOpenPanels(new Set<PanelId>(['scorecard', 'shots']))
      // Fetch round detail and set tee to match
      get<RoundDetail>(`/rounds/${roundId}`).then((detail) => {
        setRoundDetail(detail)
        setAllRoundDetails((prev) => prev.some((rd) => rd.id === roundId) ? prev : [...prev, detail])
        if (detail.tee_id) setTeeId(detail.tee_id)
      }).catch(() => { /* round not found — stay historic */ })
    }
  }, [searchParams, totalHoles])

  // Sync drawPanelOpen with panel toggle
  useEffect(() => {
    setDrawPanelOpen(openPanels.has('draw'))
  }, [openPanels])

  // ── Save (quiet: API writes only, no reload) ──
  const saveHoleQuiet = useCallback(async () => {
    if (!course) return
    const fv = formValuesRef.current
    const par = parseInt(fv.par) || undefined
    const yardage = parseInt(fv.yardage) || undefined
    const handicap = parseInt(fv.handicap) || undefined

    for (const tee of course.tees || []) {
      const teeHole = tee.holes?.find((h) => h.hole_number === currentHole)
      if (!teeHole) continue

      const body: Record<string, unknown> = { par, yardage, handicap }
      if (greenPos) { body.flag_lat = greenPos.lat; body.flag_lng = greenPos.lng }
      if (tee.id === teeId && teePos) { body.tee_lat = teePos.lat; body.tee_lng = teePos.lng }
      else if (teePositions[tee.tee_name]) { body.tee_lat = teePositions[tee.tee_name].lat; body.tee_lng = teePositions[tee.tee_name].lng }

      body.fairway_path = fairwayPath.length >= 2 ? JSON.stringify(fairwayPath.map((p) => [p.lat, p.lng])) : ''
      const validBoundaries = fairwayBoundaries.filter((poly) => poly.length >= 3)
      body.fairway_boundary = validBoundaries.length > 0 ? JSON.stringify(validBoundaries.map((poly) => poly.map((p) => [p.lat, p.lng]))) : ''
      body.green_boundary = greenBoundary.length >= 3 ? JSON.stringify(greenBoundary.map((p) => [p.lat, p.lng])) : ''

      await put(`/courses/${course.id}/holes/${teeHole.id}`, body)
    }

    // Handle hazard changes
    for (const h of hazards) {
      if (h._deleted && h.id) {
        await del(`/courses/${course.id}/hazards/${h.id}`)
      }
      if (h._new) {
        const ringToCoords = (ring: { lat: number; lng: number }[]) =>
          ring.map((p) => [p.lat, p.lng])
        const rings = [ringToCoords(h.boundary), ...((h.holes || []).map(ringToCoords))]
        await post(`/courses/${course.id}/hazards`, {
          hazard_type: h.hazard_type,
          name: h.name || '',
          boundary: JSON.stringify(rings),
        })
      }
    }
  }, [course, currentHole, teeId, teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries, greenBoundary, hazards])

  // ── Select hole: auto-save if dirty, then load geometry ──
  const selectHole = useCallback(async (holeNum: number) => {
    // Auto-save current hole if dirty before switching
    if (dirtyRef.current) {
      toast('Saving hole…', 'info')
      await saveHoleQuiet()
      queryClient.invalidateQueries({ queryKey: ['courses', courseId] })
    }

    if (!course) { setCurrentHole(holeNum); return }

    // If we auto-saved, fetch fresh course data so the new hole loads updated state
    const src = dirtyRef.current
      ? await get<CourseDetail>(`/courses/${course.id}`)
      : course
    const parsed = parseHoleData(src, holeNum, teeId)
    setCurrentHole(holeNum)
    setTeePos(parsed.teePos)
    setGreenPos(parsed.greenPos)
    setTeePositions(parsed.teePositions)
    setFairwayPath(parsed.fairwayPath)
    setFairwayBoundaries(parsed.fairwayBoundaries)
    setCurrentFwBoundary([])
    setGreenBoundary(parsed.greenBoundary)
    setHazards(parsed.hazards)
    setCurrentHazard([])
    setDirty(false)
    setRedrawKey((k) => k + 1)

    // Sync form values
    if (parsed.hole) {
      formValuesRef.current = {
        par: parsed.hole.par?.toString() ?? '',
        yardage: parsed.hole.yardage?.toString() ?? '',
        handicap: parsed.hole.handicap?.toString() ?? '',
      }
    } else {
      formValuesRef.current = { par: '', yardage: '', handicap: '' }
    }
  }, [course, teeId, saveHoleQuiet, queryClient, courseId])

  // Load initial hole when course data arrives
  const courseLoadedRef = useRef(false)
  useEffect(() => {
    if (course && !courseLoadedRef.current) {
      courseLoadedRef.current = true
      selectHole(currentHole)
    }
  }, [course, currentHole, selectHole])

  // Re-select hole when tee changes
  useEffect(() => {
    if (course && courseLoadedRef.current) selectHole(currentHole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeId])

  // ── Save + reload (for manual save button) ──
  const saveCurrentHole = useCallback(async () => {
    await saveHoleQuiet()
    queryClient.invalidateQueries({ queryKey: ['courses', courseId] })
    if (!course) return
    const updated = await get<CourseDetail>(`/courses/${course.id}`)
    const parsed = parseHoleData(updated, currentHole, teeId)
    setTeePos(parsed.teePos)
    setGreenPos(parsed.greenPos)
    setTeePositions(parsed.teePositions)
    setFairwayPath(parsed.fairwayPath)
    setFairwayBoundaries(parsed.fairwayBoundaries)
    setGreenBoundary(parsed.greenBoundary)
    setHazards(parsed.hazards)
    setDirty(false)
    setRedrawKey((k) => k + 1)
  }, [saveHoleQuiet, course, courseId, currentHole, teeId, queryClient])

  // ── Reload course (after tee edits) ──
  const reloadCourse = useCallback(async () => {
    if (!courseId) return
    queryClient.invalidateQueries({ queryKey: ['courses', courseId] })
  }, [courseId, queryClient])

  // ── Assign an OSM hole to a CourseHole (by hole number) ──
  const assignOsmHoleToHole = useCallback(async (
    osmHoleId: number, holeNum: number, applyGps = true,
  ) => {
    if (!course || !courseId) return
    // Find any CourseHole with this hole_number — backend propagates to siblings
    let holeId: number | undefined
    for (const t of course.tees || []) {
      const h = t.holes?.find((hh) => hh.hole_number === holeNum)
      if (h) { holeId = h.id; break }
    }
    if (!holeId) {
      toast(`No hole ${holeNum} found on this course`, 'error')
      return
    }
    try {
      await linkOsmHole({ courseId, holeId, osmHoleId, applyGps })
      toast(`OSM hole linked to #${holeNum}`, 'success')
      await queryClient.invalidateQueries({ queryKey: ['courses', courseId] })
      if (applyGps) {
        // Refetch and replace editor state — any unsaved geometry on this hole is lost
        const updated = await get<CourseDetail>(`/courses/${courseId}`)
        const parsed = parseHoleData(updated, currentHole, teeId)
        setTeePos(parsed.teePos)
        setGreenPos(parsed.greenPos)
        setTeePositions(parsed.teePositions)
        setFairwayPath(parsed.fairwayPath)
        setFairwayBoundaries(parsed.fairwayBoundaries)
        setGreenBoundary(parsed.greenBoundary)
      }
      setRedrawKey((k) => k + 1)
    } catch (err) {
      toast(`Link failed: ${(err as Error).message}`, 'error')
    }
  }, [course, courseId, queryClient, toast, currentHole, teeId])

  // ── Finish drawing helpers ──
  const finishHazard = useCallback(() => {
    if (currentHazard.length < 3) return
    setHazards((prev) => [...prev, { hazard_type: hazardType, boundary: [...currentHazard], _new: true }])
    setCurrentHazard([])
    setDirty(true)
    setRedrawKey((k) => k + 1)
  }, [currentHazard, hazardType])

  const finishFwBoundary = useCallback(() => {
    if (currentFwBoundary.length < 3) return
    setFairwayBoundaries((prev) => [...prev, [...currentFwBoundary]])
    setCurrentFwBoundary([])
    setDirty(true)
    setRedrawKey((k) => k + 1)
  }, [currentFwBoundary])

  const triggerRedraw = useCallback(() => setRedrawKey((k) => k + 1), [])

  // ── Panel toggle ──
  const togglePanel = useCallback((panelId: PanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev)
      if (next.has(panelId)) {
        next.delete(panelId)
      } else {
        for (const [a, b] of MUTUALLY_EXCLUSIVE) {
          if (panelId === a && next.has(b)) next.delete(b)
          if (panelId === b && next.has(a)) next.delete(a)
        }
        next.add(panelId)
      }
      return next
    })
  }, [])

  const closePanel = useCallback((pid: PanelId) => {
    setOpenPanels((prev) => { const next = new Set(prev); next.delete(pid); return next })
  }, [])

  // Hole nav
  const prevHole = useCallback(() => selectHole(currentHole > 1 ? currentHole - 1 : totalHoles), [currentHole, totalHoles, selectHole])
  const nextHole = useCallback(() => selectHole(currentHole < totalHoles ? currentHole + 1 : 1), [currentHole, totalHoles, selectHole])

  // ── Build context value ──
  const ctxValue: CourseMapContextType = useMemo(() => ({
    course, strategy, currentHole, teeId, dirty,
    drawPanelOpen, activeTool, hazardType, showUnlinkedOsm,
    teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries,
    currentFwBoundary, greenBoundary, hazards, currentHazard, ballPos,
    activeStrategyTool, currentPlanId, planAiming, viewMode, roundDetail, allRoundDetails,

    setCurrentHole, setTeeId, setDirty,
    setDrawPanelOpen, setActiveTool, setHazardType, setShowUnlinkedOsm,
    assignOsmHoleToHole,
    setTeePos, setGreenPos, setTeePositions, setFairwayPath, setFairwayBoundaries,
    setCurrentFwBoundary, setGreenBoundary, setHazards, setCurrentHazard, setBallPos,
    setActiveStrategyTool, setCurrentPlanId, setPlanAiming, setViewMode, setRoundDetail, setAllRoundDetails,

    selectHole, saveCurrentHole, reloadCourse, finishHazard, finishFwBoundary,
    redrawKey, triggerRedraw,

    _formValues: formValuesRef.current,
  }), [
    course, strategy, currentHole, teeId, dirty,
    drawPanelOpen, activeTool, hazardType, showUnlinkedOsm,
    teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries,
    currentFwBoundary, greenBoundary, hazards, currentHazard, ballPos,
    activeStrategyTool, currentPlanId, planAiming, viewMode, roundDetail, allRoundDetails,
    assignOsmHoleToHole,
    selectHole, saveCurrentHole, reloadCourse, finishHazard, finishFwBoundary,
    redrawKey, triggerRedraw,
  ])

  return (
    <CourseMapContext.Provider value={ctxValue}>
      <div className={s.layout}>
        {/* Map */}
        <div className={s.mapContainer}>
          <Map
            {...viewState}
            onMove={evt => setViewState(evt.viewState)}
            onClick={onMapClick}
            onDblClick={onMapDblClick}
            onContextMenu={onMapContextMenu}
            mapStyle={SATELLITE_STYLE}
            maxPitch={85}
            style={{ width: '100%', height: '100%' }}
            attributionControl={false}
            interactiveLayerIds={interactiveLayerIds}
            cursor={drawPanelOpen && activeTool ? 'crosshair' : undefined}
          >
            <DesktopMapLibreOverlays />
            <DesktopEditingOverlays />
            <DesktopShotOverlays visible={openPanels.has('shots')} />
            <DesktopStrategyOverlays visible={openPanels.has('strategy')} />
            <DesktopPlanOverlays visible={openPanels.has('planning')} planId={currentPlanId} />
            <DesktopPlanAimOverlay />
          </Map>
        </div>

        {/* Back button */}
        <button className={s.backBtn} onClick={() => navigate(courseId ? `/courses/${courseId}` : '/courses')}>
          <ArrowLeft size={14} /> Back
        </button>

        {/* Toolbar */}
        <div className={s.toolbar}>
          <div className={s.toolbarDragHandle} />
          <div className={s.holeQuickNav}>
            <button className={s.holeQuickBtn} onClick={prevHole}>&lt;</button>
            <span className={s.holeQuickLabel}>{currentHole}</span>
            <button className={s.holeQuickBtn} onClick={nextHole}>&gt;</button>
          </div>
          <div className={s.toolbarIcons}>
            {/* Camera orientation toggles (Stage 20f) */}
            <button
              className={`${s.toolbarIcon}${orient === 'green-up' ? ` ${s.active}` : ''}`}
              title={orient === 'green-up' ? 'Tee → green up (click to switch to north up)' : 'North up (click to switch to tee → green up)'}
              onClick={() => setOrient(o => o === 'green-up' ? 'north-up' : 'green-up')}
              disabled={cameraResolved.bearingDeg == null && orient !== 'green-up'}
            >
              {orient === 'green-up' ? (
                /* compass with arrow pointing up the hole */
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 4l3 8h-6z" fill="currentColor" />
                  <line x1="12" y1="14" x2="12" y2="20" />
                </svg>
              ) : (
                /* compass with N pointing up */
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <text x="12" y="9" textAnchor="middle" fontSize="8" fill="currentColor" stroke="none">N</text>
                  <path d="M12 11v6" />
                </svg>
              )}
            </button>
            <button
              className={`${s.toolbarIcon}${tilt === 'perspective' ? ` ${s.active}` : ''}`}
              title={tilt === 'perspective' ? 'Player view (click for top-down)' : 'Top-down (click for player view)'}
              onClick={() => setTilt(t => t === 'perspective' ? 'flat' : 'perspective')}
            >
              {tilt === 'perspective' ? (
                /* perspective rectangle */
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18 L8 6 L16 6 L21 18 Z" />
                </svg>
              ) : (
                /* flat square */
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="1" />
                </svg>
              )}
            </button>
            <div className={s.toolbarDivider} />
            {ANALYSIS_PANELS.map((pid) => (
              <button key={pid} className={`${s.toolbarIcon}${openPanels.has(pid) ? ` ${s.active}` : ''}`} title={PANEL_ICONS[pid].title} onClick={() => togglePanel(pid)}>
                {PANEL_ICONS[pid].svg}
              </button>
            ))}
            <div className={s.toolbarDivider} />
            {EDITING_PANELS.map((pid) => (
              <button key={pid} className={`${s.toolbarIcon}${openPanels.has(pid) ? ` ${s.active}` : ''}`} title={PANEL_ICONS[pid].title} onClick={() => togglePanel(pid)}>
                {PANEL_ICONS[pid].svg}
              </button>
            ))}
          </div>
          <div className={s.toolbarSave}>
            <button className={s.saveBtn} title="Save hole" disabled={!dirty} onClick={saveCurrentHole}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            </button>
          </div>
        </div>

        {/* Floating panels */}
        {openPanels.has('hole') && <EditHolePanel onClose={() => closePanel('hole')} />}
        {openPanels.has('draw') && <DrawToolsPanel onClose={() => closePanel('draw')} />}
        {openPanels.has('scorecard') && <ScorecardPanel onClose={() => closePanel('scorecard')} />}
        {openPanels.has('overview') && <OverviewPanel onClose={() => closePanel('overview')} />}
        {openPanels.has('shots') && <ShotsPanel onClose={() => closePanel('shots')} />}
        {openPanels.has('insights') && <InsightsPanel onClose={() => closePanel('insights')} />}
        {openPanels.has('strategy') && <StrategyToolsPanel onClose={() => closePanel('strategy')} />}
        {openPanels.has('planning') && <PlanningPanel onClose={() => closePanel('planning')} />}
        {openPanels.has('data') && <DataImportPanel onClose={() => closePanel('data')} />}
      </div>
    </CourseMapContext.Provider>
  )
}
