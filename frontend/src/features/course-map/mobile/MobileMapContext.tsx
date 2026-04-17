import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useCourse, put, get } from '../../../api'
import type { CourseDetail, RoundDetail } from '../../../api'
import { useCourseStrategy } from '../useCourseStrategy'
import { useCourseRounds } from '../useCourseRounds'
import { parseHoleData } from '../courseMapState'
import type { LatLng, EditorHazard } from '../courseMapState'
import type { CourseStrategyData } from '../useCourseStrategy'
import { setClubColorCache } from '../clubColors'
import { useGpsPosition } from './useGpsPosition'
import type { GpsState } from './useGpsPosition'

export interface MobileMapState {
  courseId: number | undefined
  course: CourseDetail | undefined
  strategy: CourseStrategyData | undefined
  currentHole: number
  totalHoles: number
  teeId: number | undefined

  // Read-only geometry
  teePos: LatLng | null
  greenPos: LatLng | null
  teePositions: Record<string, LatLng>
  fairwayPath: LatLng[]
  fairwayBoundaries: LatLng[][]
  greenBoundary: LatLng[]
  hazards: EditorHazard[]

  // Round data
  viewMode: 'historic' | number
  roundDetail: RoundDetail | null
  allRoundDetails: RoundDetail[]

  // GPS
  gps: GpsState & { startWatching: () => void; stopWatching: () => void }

  // Ball position (review mode: manual placement, defaults to tee)
  ballPos: LatLng | null

  // Mode
  playMode: boolean

  // Display toggles
  showOverlays: boolean

  // Rangefinder tools
  activeRangefinderTool: 'none' | 'cone' | 'landing' | 'carry' | 'recommend' | 'ruler'
  selectedClubType: string | null

  // Edit state (minimal: tee, green, fairway line, par/yardage, ball placement)
  editMode: 'tee' | 'green' | 'fairway' | 'ball' | null
  dirty: boolean
  formValues: { par: string; yardage: string; handicap: string }
}

export interface MobileMapActions {
  selectHole: (holeNum: number) => void
  prevHole: () => void
  nextHole: () => void
  setTeeId: (id: number) => void
  setViewMode: (mode: 'historic' | number) => void
  setRoundDetail: (detail: RoundDetail | null) => void
  setAllRoundDetails: (details: RoundDetail[]) => void

  // Display toggles
  setShowOverlays: (show: boolean) => void

  // Rangefinder tool actions
  setActiveRangefinderTool: (tool: 'none' | 'cone' | 'landing' | 'carry' | 'recommend' | 'ruler') => void
  setSelectedClubType: (clubType: string | null) => void

  // Ball position
  setBallPos: (pos: LatLng | null) => void

  // Edit actions
  setEditMode: (mode: 'tee' | 'green' | 'fairway' | 'ball' | null) => void
  setTeePos: (pos: LatLng | null) => void
  setGreenPos: (pos: LatLng | null) => void
  setFairwayPath: (path: LatLng[]) => void
  setFormValues: (vals: { par: string; yardage: string; handicap: string }) => void
  setDirty: (dirty: boolean) => void
  saveHole: () => Promise<void>
  redrawKey: number
  triggerRedraw: () => void
}

export type MobileMapContextType = MobileMapState & MobileMapActions

const MobileMapCtx = createContext<MobileMapContextType | null>(null)

export function useMobileMap() {
  const ctx = useContext(MobileMapCtx)
  if (!ctx) throw new Error('useMobileMap must be used within MobileMapProvider')
  return ctx
}

export function MobileMapProvider({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const courseId = id ? Number(id) : undefined

  const { data: course } = useCourse(courseId)
  const { data: strategy } = useCourseStrategy(courseId)
  const totalHoles = course?.holes ?? 18

  const gps = useGpsPosition()

  // Sync club colors
  useEffect(() => {
    if (strategy?.player?.clubs) setClubColorCache(strategy.player.clubs)
  }, [strategy])

  // Core state
  const [currentHole, setCurrentHole] = useState(1)
  const [teeId, setTeeId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('birdie_book_default_tee')
    return saved ? Number(saved) : undefined
  })

  // Geometry state
  const [teePos, setTeePos] = useState<LatLng | null>(null)
  const [greenPos, setGreenPos] = useState<LatLng | null>(null)
  const [teePositions, setTeePositions] = useState<Record<string, LatLng>>({})
  const [fairwayPath, setFairwayPath] = useState<LatLng[]>([])
  const [fairwayBoundaries, setFairwayBoundaries] = useState<LatLng[][]>([])
  const [greenBoundary, setGreenBoundary] = useState<LatLng[]>([])
  const [hazards, setHazards] = useState<EditorHazard[]>([])
  const [redrawKey, setRedrawKey] = useState(0)

  // Play mode (derived from URL param)
  const playMode = searchParams.get('mode') === 'play'

  // Tee from URL (for play mode)
  useEffect(() => {
    const teeParam = searchParams.get('tee')
    if (teeParam) setTeeId(Number(teeParam))
  }, [searchParams])

  // Display toggles
  const [showOverlays, setShowOverlays] = useState(!playMode)

  // Rangefinder tool state
  const [activeRangefinderTool, setActiveRangefinderTool] = useState<'none' | 'cone' | 'landing' | 'carry' | 'recommend' | 'ruler'>('none')
  const [selectedClubType, setSelectedClubType] = useState<string | null>(null)

  // Ball position (review mode only — defaults to tee)
  const [ballPos, setBallPos] = useState<LatLng | null>(null)

  // Edit state
  const [editMode, setEditMode] = useState<'tee' | 'green' | 'fairway' | 'ball' | null>(null)
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  const formValuesRef = useRef({ par: '', yardage: '', handicap: '' })
  const [formValues, setFormValuesState] = useState({ par: '', yardage: '', handicap: '' })
  const setFormValues = useCallback((vals: { par: string; yardage: string; handicap: string }) => {
    formValuesRef.current = vals
    setFormValuesState(vals)
  }, [])

  // Round state
  const [viewMode, setViewMode] = useState<'historic' | number>('historic')
  const [roundDetail, setRoundDetail] = useState<RoundDetail | null>(null)
  const [allRoundDetails, setAllRoundDetails] = useState<RoundDetail[]>([])

  // Auto-load all round details for hole history data
  const { data: courseRounds = [] } = useCourseRounds(courseId)
  const roundsLoadedRef = useRef(false)
  useEffect(() => {
    if (roundsLoadedRef.current || courseRounds.length === 0 || allRoundDetails.length > 0) return
    roundsLoadedRef.current = true
    const load = async () => {
      const details: RoundDetail[] = []
      for (const r of courseRounds) {
        try { details.push(await get<RoundDetail>(`/rounds/${r.id}`)) } catch { /* skip */ }
      }
      if (details.length > 0) setAllRoundDetails(details)
    }
    load()
  }, [courseRounds, allRoundDetails.length])

  // Tee default
  useEffect(() => {
    if (!course?.tees?.length) return
    if (teeId && course.tees.some(t => t.id === teeId)) return
    setTeeId(course.tees[0].id)
  }, [course, teeId])

  useEffect(() => {
    if (teeId !== undefined) localStorage.setItem('birdie_book_default_tee', String(teeId))
  }, [teeId])

  // Parse URL params
  useEffect(() => {
    const h = searchParams.get('hole')
    if (h) { const n = Number(h); if (n >= 1 && n <= totalHoles) setCurrentHole(n) }
    const r = searchParams.get('round')
    if (r) {
      const roundId = Number(r)
      setViewMode(roundId)
      get<RoundDetail>(`/rounds/${roundId}`).then(detail => {
        setRoundDetail(detail)
        setAllRoundDetails(prev => prev.some(rd => rd.id === roundId) ? prev : [...prev, detail])
        if (detail.tee_id) setTeeId(detail.tee_id)
      }).catch(() => {})
    }
  }, [searchParams, totalHoles])

  // Save
  const saveHole = useCallback(async () => {
    if (!course) return
    const fv = formValuesRef.current
    const par = parseInt(fv.par) || undefined
    const yardage = parseInt(fv.yardage) || undefined
    const handicap = parseInt(fv.handicap) || undefined

    for (const tee of course.tees || []) {
      const teeHole = tee.holes?.find(h => h.hole_number === currentHole)
      if (!teeHole) continue
      const body: Record<string, unknown> = { par, yardage, handicap }
      if (greenPos) { body.flag_lat = greenPos.lat; body.flag_lng = greenPos.lng }
      if (tee.id === teeId && teePos) { body.tee_lat = teePos.lat; body.tee_lng = teePos.lng }
      body.fairway_path = fairwayPath.length >= 2 ? JSON.stringify(fairwayPath.map(p => [p.lat, p.lng])) : ''
      await put(`/courses/${course.id}/holes/${teeHole.id}`, body)
    }
    queryClient.invalidateQueries({ queryKey: ['courses', courseId] })
    setDirty(false)
  }, [course, currentHole, teeId, teePos, greenPos, fairwayPath, courseId, queryClient])

  // Select hole
  const selectHole = useCallback(async (holeNum: number) => {
    if (dirtyRef.current && course) {
      await saveHole()
    }
    if (!course) { setCurrentHole(holeNum); return }

    const src = dirtyRef.current ? await get<CourseDetail>(`/courses/${course.id}`) : course
    const parsed = parseHoleData(src, holeNum, teeId)
    setCurrentHole(holeNum)
    setTeePos(parsed.teePos)
    setGreenPos(parsed.greenPos)
    setTeePositions(parsed.teePositions)
    setFairwayPath(parsed.fairwayPath)
    setFairwayBoundaries(parsed.fairwayBoundaries)
    setGreenBoundary(parsed.greenBoundary)
    setHazards(parsed.hazards)
    setDirty(false)
    setEditMode(null)
    if (!playMode) setBallPos(parsed.teePos)
    setRedrawKey(k => k + 1)

    if (parsed.hole) {
      const vals = {
        par: parsed.hole.par?.toString() ?? '',
        yardage: parsed.hole.yardage?.toString() ?? '',
        handicap: parsed.hole.handicap?.toString() ?? '',
      }
      formValuesRef.current = vals
      setFormValuesState(vals)
    } else {
      const vals = { par: '', yardage: '', handicap: '' }
      formValuesRef.current = vals
      setFormValuesState(vals)
    }
  }, [course, teeId, saveHole])

  // Load initial hole
  const courseLoadedRef = useRef(false)
  useEffect(() => {
    if (course && !courseLoadedRef.current) {
      courseLoadedRef.current = true
      selectHole(currentHole)
    }
  }, [course, currentHole, selectHole])

  // Re-select on tee change
  useEffect(() => {
    if (course && courseLoadedRef.current) selectHole(currentHole)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teeId])

  const prevHole = useCallback(() => selectHole(currentHole > 1 ? currentHole - 1 : totalHoles), [currentHole, totalHoles, selectHole])
  const nextHole = useCallback(() => selectHole(currentHole < totalHoles ? currentHole + 1 : 1), [currentHole, totalHoles, selectHole])
  const triggerRedraw = useCallback(() => setRedrawKey(k => k + 1), [])

  const value: MobileMapContextType = useMemo(() => ({
    courseId, course, strategy, currentHole, totalHoles, teeId,
    teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries, greenBoundary, hazards,
    viewMode, roundDetail, allRoundDetails,
    gps,
    ballPos,
    playMode,
    showOverlays,
    activeRangefinderTool, selectedClubType,
    editMode, dirty, formValues: formValuesRef.current,
    selectHole, prevHole, nextHole, setTeeId,
    setViewMode, setRoundDetail, setAllRoundDetails,
    setBallPos,
    setShowOverlays,
    setActiveRangefinderTool, setSelectedClubType,
    setEditMode, setTeePos, setGreenPos, setFairwayPath,
    setFormValues, setDirty, saveHole,
    redrawKey, triggerRedraw,
  }), [
    courseId, course, strategy, currentHole, totalHoles, teeId,
    teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries, greenBoundary, hazards,
    viewMode, roundDetail, allRoundDetails,
    gps,
    ballPos,
    playMode,
    showOverlays,
    activeRangefinderTool, selectedClubType,
    editMode, dirty, formValues,
    selectHole, prevHole, nextHole,
    setFormValues, saveHole,
    redrawKey, triggerRedraw,
  ])

  return <MobileMapCtx.Provider value={value}>{children}</MobileMapCtx.Provider>
}
