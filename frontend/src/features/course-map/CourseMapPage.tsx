import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
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
import { MapOverlays } from './MapOverlays'
import { EditHolePanel } from './EditHolePanel'
import { DrawToolsPanel } from './DrawToolsPanel'
import { ScorecardPanel } from './ScorecardPanel'
import { OverviewPanel } from './OverviewPanel'
import { ShotsPanel } from './ShotsPanel'
import { ShotOverlays } from './ShotOverlays'
import { InsightsPanel } from './InsightsPanel'
import { StrategyToolsPanel } from './StrategyToolsPanel'
import { StrategyOverlays } from './StrategyOverlays'
import type { StrategyTool } from './StrategyToolsPanel'
import { PlanningPanel } from './PlanningPanel'
import { PlanOverlays } from './PlanOverlays'
import { PlanAimOverlay } from './PlanAimOverlay'
import { DataImportPanel } from './DataImportPanel'
import { MobileHoleViewer } from './mobile/MobileHoleViewer'
import s from './CourseMapPage.module.css'
import 'leaflet/dist/leaflet.css'

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
function MapController({ course, currentHole, teeId, allRoundDetails }: { course: CourseDetail | undefined; currentHole: number; teeId: number | undefined; allRoundDetails: RoundDetail[] }) {
  const map = useMap()
  const initialRef = useRef(false)

  useEffect(() => {
    if (!course) return
    const tee = course.tees?.find((t) => t.id === teeId) ?? course.tees?.[0]
    const hole = tee?.holes?.find((h) => h.hole_number === currentHole)

    let lat: number | undefined, lng: number | undefined

    // 1. Tee GPS from course data
    if (hole?.tee_lat && hole?.tee_lng) {
      lat = hole.tee_lat; lng = hole.tee_lng
    } else {
      // 2. First shot GPS from Garmin round data
      for (const rd of allRoundDetails) {
        const rh = rd.holes?.find((h) => h.hole_number === currentHole)
        const firstShot = rh?.shots?.find((s) => s.shot_number === 1)
        if (firstShot?.start_lat && firstShot?.start_lng) {
          lat = firstShot.start_lat; lng = firstShot.start_lng
          break
        }
      }
    }

    // 3. Initial load only: fall back to course center
    if (!lat && !initialRef.current && course.lat && course.lng) {
      lat = course.lat; lng = course.lng
    }
    // If still no GPS, stay where we are

    if (lat && lng) {
      if (!initialRef.current) { map.setView([lat, lng], 17); initialRef.current = true }
      else map.flyTo([lat, lng], map.getZoom(), { duration: 0.5 })
    }
  }, [map, course, currentHole, teeId, allRoundDetails])

  return null
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
        await post(`/courses/${course.id}/hazards`, {
          hazard_type: h.hazard_type,
          name: h.name || '',
          boundary: JSON.stringify(h.boundary.map((p) => [p.lat, p.lng])),
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

  const mapCenter = useMemo<[number, number]>(() => {
    if (course?.lat && course?.lng) return [course.lat, course.lng]
    return [42.7, -83.5]
  }, [course])

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
          <MapContainer center={mapCenter} zoom={16} style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
            <MapController course={course} currentHole={currentHole} teeId={teeId} allRoundDetails={allRoundDetails} />
            <MapOverlays />
            <ShotOverlays visible={openPanels.has('shots')} />
            <StrategyOverlays visible={openPanels.has('strategy')} activeTool={activeStrategyTool as StrategyTool} />
            <PlanOverlays visible={openPanels.has('planning')} planId={currentPlanId} />
            <PlanAimOverlay />
          </MapContainer>
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
