import { createContext, useContext } from 'react'
import type { CourseDetail, CourseHole } from '../../api'
import type { CourseStrategyData } from './useCourseStrategy'

// ── Panel IDs ──
export type PanelId =
  | 'scorecard' | 'overview' | 'shots' | 'insights' | 'strategy' | 'planning' | 'clubs'
  | 'hole' | 'draw' | 'data'

// ── Geo point ──
export interface LatLng {
  lat: number
  lng: number
}

// ── Parsed hazard (with runtime flags) ──
export interface EditorHazard {
  id?: number
  hazard_type: string
  name?: string | null
  boundary: LatLng[]              // outer ring
  holes?: LatLng[][]              // inner rings (cutouts) — OSM water multipolygons
  _new?: boolean
  _deleted?: boolean
}

/**
 * Parse a CourseHazard.boundary JSON string into outer + holes.
 *
 * Storage is GeoJSON-style polygon coordinates: `[outer, hole1, hole2, ...]`.
 * Legacy rows store a flat ring `[lat,lng], ...]` — promoted on read.
 *
 * Returns `{ outer: [], holes: [] }` on parse failure or empty input.
 */
export function parseHazardBoundary(json: string | null | undefined): {
  outer: LatLng[]
  holes: LatLng[][]
} {
  if (!json) return { outer: [], holes: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { outer: [], holes: [] }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return { outer: [], holes: [] }

  const toRing = (raw: unknown): LatLng[] =>
    Array.isArray(raw)
      ? raw
          .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
          .map((p) => ({ lat: p[0], lng: p[1] }))
      : []

  // Nested shape: first element's first element is itself an array
  const first = parsed[0] as unknown[]
  if (Array.isArray(first) && first.length > 0 && Array.isArray(first[0])) {
    const rings = (parsed as unknown[]).map(toRing)
    return { outer: rings[0] ?? [], holes: rings.slice(1).filter((r) => r.length >= 3) }
  }
  // Legacy flat ring
  return { outer: toRing(parsed), holes: [] }
}

// ── Round plan types (shared between PlanningPanel and ScorecardPanel) ──
export interface PlanShot {
  shot_number: number
  club?: string | null
  aim_lat?: number | null
  aim_lng?: number | null
  notes?: string | null
}

export interface PlanHole {
  hole_number: number
  strategy_notes?: string | null
  shots?: PlanShot[]
}

export interface Plan {
  id: number
  name: string
  tee_id: number
  course_id: number
  planned_date?: string | null
  status?: string
  /** Target round score (e.g. 99 for "break 100"). Drives per-hole personal-par
   * allocation in the scorecard. Null = no goal set; scorecard falls back to
   * stock par for coloring/comparison. */
  score_goal?: number | null
  round_id?: number | null
  holes?: PlanHole[]
}

// ── Drawing tool types ──
export type DrawTool = 'tee' | 'green' | 'fairway' | 'fairway-boundary' | 'green-boundary' | 'hazard'
export type HazardType = 'bunker' | 'water' | 'out_of_bounds' | 'trees' | 'waste_area'

// ── Tee color map ──
export const TEE_COLORS: Record<string, string> = {
  Blue: '#2196F3',
  White: '#fff',
  Red: '#f44336',
  Gold: '#FFD700',
  Black: '#333',
  Green: '#4CAF50',
}

// ── Hazard color map ──
export const HAZARD_COLORS: Record<string, [string, string]> = {
  bunker: ['#EDC967', '#C4A34D'],
  water: ['#2196F3', '#1565C0'],
  out_of_bounds: ['#f44336', '#c62828'],
  trees: ['#2E7D32', '#1B5E20'],
  waste_area: ['#8D6E63', '#5D4037'],
}

export const HAZARD_LABELS: Record<string, string> = {
  bunker: 'Bunker',
  water: 'Water',
  out_of_bounds: 'OB',
  trees: 'Trees',
  waste_area: 'Waste',
}

// ── Data source colors ──
export const DATA_SOURCE_COLORS: Record<string, string> = {
  api: '#42a5f5',
  osm: '#4caf50',
  manual: '#9e9e9e',
  garmin: '#ff9800',
}

// ── The full editor state ──
export interface CourseMapState {
  course: CourseDetail | undefined
  strategy: CourseStrategyData | undefined
  currentHole: number
  teeId: number | undefined
  dirty: boolean

  // Drawing state
  drawPanelOpen: boolean
  activeTool: DrawTool | null
  hazardType: HazardType

  // OSM linking
  showUnlinkedOsm: boolean

  // Hole geometry (mutable during editing)
  teePos: LatLng | null
  greenPos: LatLng | null
  teePositions: Record<string, LatLng>
  fairwayPath: LatLng[]
  fairwayBoundaries: LatLng[][]
  currentFwBoundary: LatLng[]
  greenBoundary: LatLng[]
  hazards: EditorHazard[]
  currentHazard: LatLng[]

  // Ball position for strategy tools
  ballPos: LatLng | null

  // Strategy tools
  activeStrategyTool: string

  // Planning
  currentPlanId: number | null
  currentPlan: Plan | null  // hydrated plan with holes/shots — drives ScorecardPanel's Goal row
  planAiming: { club: string; ballPos: LatLng } | null  // non-null = aiming mode active

  // Round view mode (shared across scorecard/overview/shots)
  viewMode: 'historic' | number
  roundDetail: import('../../api').RoundDetail | null
  allRoundDetails: import('../../api').RoundDetail[]
}

// ── Actions to mutate state ──
export interface CourseMapActions {
  setCurrentHole: (hole: number) => void
  setTeeId: (id: number) => void
  setDirty: (dirty: boolean) => void
  setDrawPanelOpen: (open: boolean) => void
  setActiveTool: (tool: DrawTool | null) => void
  setHazardType: (type: HazardType) => void
  setShowUnlinkedOsm: (show: boolean) => void

  // Assign an OSMHole to the CourseHole at holeNum.
  // applyGps=true (default): backend applies OSM tee/green/fairway coords + local editor state
  //   reloads from DB (overwrites any unsaved geometry).
  // applyGps=false: only records the link (osm_hole_id); caller handles coord updates. Used by
  //   the snap-from-drawtool flow to preserve unsaved edits to other fields.
  assignOsmHoleToHole: (osmHoleId: number, holeNum: number, applyGps?: boolean) => Promise<void>

  // Geometry setters
  setTeePos: (pos: LatLng | null) => void
  setGreenPos: (pos: LatLng | null) => void
  setTeePositions: (positions: Record<string, LatLng>) => void
  setFairwayPath: (path: LatLng[]) => void
  setFairwayBoundaries: (boundaries: LatLng[][]) => void
  setCurrentFwBoundary: (boundary: LatLng[]) => void
  setGreenBoundary: (boundary: LatLng[]) => void
  setHazards: (hazards: EditorHazard[]) => void
  setCurrentHazard: (hazard: LatLng[]) => void
  setBallPos: (pos: LatLng | null) => void
  setActiveStrategyTool: (tool: string) => void
  setCurrentPlanId: (id: number | null) => void
  setCurrentPlan: (plan: Plan | null) => void
  setPlanAiming: (aiming: { club: string; ballPos: LatLng } | null) => void
  setViewMode: (mode: 'historic' | number) => void
  setRoundDetail: (detail: import('../../api').RoundDetail | null) => void
  setAllRoundDetails: (details: import('../../api').RoundDetail[]) => void

  // High-level actions
  selectHole: (holeNum: number) => void
  saveCurrentHole: () => Promise<void>
  reloadCourse: () => Promise<void>
  finishHazard: () => void
  finishFwBoundary: () => void

  // Map redraw trigger
  redrawKey: number
  triggerRedraw: () => void

  // Form values ref (shared between EditHolePanel and save)
  _formValues: { par: string; yardage: string; handicap: string }
}

export type CourseMapContextType = CourseMapState & CourseMapActions

export const CourseMapContext = createContext<CourseMapContextType | null>(null)

export function useCourseMap() {
  const ctx = useContext(CourseMapContext)
  if (!ctx) throw new Error('useCourseMap must be used within CourseMapProvider')
  return ctx
}

// ── Parse hole data into editor state ──
export function parseHoleData(
  course: CourseDetail,
  holeNum: number,
  teeId: number | undefined,
): Pick<CourseMapState, 'teePos' | 'greenPos' | 'teePositions' | 'fairwayPath' | 'fairwayBoundaries' | 'greenBoundary' | 'hazards'> & { hole: CourseHole | undefined } {
  const tee = course.tees?.find((t) => t.id === teeId) ?? course.tees?.[0]
  const hole = tee?.holes?.find((h) => h.hole_number === holeNum)

  const teePos = hole?.tee_lat && hole?.tee_lng ? { lat: hole.tee_lat, lng: hole.tee_lng } : null
  const greenPos = hole?.flag_lat && hole?.flag_lng ? { lat: hole.flag_lat, lng: hole.flag_lng } : null

  // Fairway path
  let fairwayPath: LatLng[] = []
  if (hole?.fairway_path) {
    try {
      fairwayPath = JSON.parse(hole.fairway_path).map((p: number[]) => ({ lat: p[0], lng: p[1] }))
    } catch { /* ignore */ }
  }

  // Fairway boundaries (multi-polygon support)
  let fairwayBoundaries: LatLng[][] = []
  if (hole?.fairway_boundary) {
    try {
      const parsed = JSON.parse(hole.fairway_boundary)
      if (parsed.length > 0 && Array.isArray(parsed[0]) && Array.isArray(parsed[0][0])) {
        fairwayBoundaries = parsed.map((poly: number[][]) => poly.map((p: number[]) => ({ lat: p[0], lng: p[1] })))
      } else if (parsed.length > 0) {
        fairwayBoundaries = [parsed.map((p: number[]) => ({ lat: p[0], lng: p[1] }))]
      }
    } catch { /* ignore */ }
  }

  // Green boundary
  let greenBoundary: LatLng[] = []
  if (hole?.green_boundary) {
    try {
      greenBoundary = JSON.parse(hole.green_boundary).map((p: number[]) => ({ lat: p[0], lng: p[1] }))
    } catch { /* ignore */ }
  }

  // All tee positions
  const teePositions: Record<string, LatLng> = {}
  for (const t of course.tees || []) {
    const th = t.holes?.find((h) => h.hole_number === holeNum)
    if (th?.tee_lat && th?.tee_lng) {
      teePositions[t.tee_name] = { lat: th.tee_lat, lng: th.tee_lng }
    }
  }

  // Hazards (club-level)
  const hazards: EditorHazard[] = (course.hazards || []).map((h) => {
    const { outer, holes } = parseHazardBoundary(h.boundary)
    return { id: h.id, hazard_type: h.hazard_type, name: h.name, boundary: outer, holes }
  })

  return { hole, teePos, greenPos, teePositions, fairwayPath, fairwayBoundaries, greenBoundary, hazards }
}

// ── Completeness check ──
export interface CompletenessCheck {
  label: string
  present: boolean
}

export function getCompleteness(state: CourseMapState): CompletenessCheck[] {
  return [
    { label: 'Par', present: false }, // filled by panel from form
    { label: 'Tee GPS', present: !!state.teePos },
    { label: 'Green GPS', present: !!state.greenPos },
    { label: 'FW Path', present: state.fairwayPath.length >= 2 },
    { label: 'Green Bnd', present: state.greenBoundary.length >= 3 },
  ]
}

// ── Hole completeness for the nav grid ──
export function getHoleCompleteness(
  course: CourseDetail,
  holeNum: number,
  teeId: number | undefined,
): number {
  const tee = course.tees?.find((t) => t.id === teeId) ?? course.tees?.[0]
  const hole = tee?.holes?.find((h) => h.hole_number === holeNum)
  if (!hole) return 0
  let count = 0
  if (hole.par) count++
  if (hole.tee_lat) count++
  if (hole.flag_lat) count++
  if (hole.fairway_path) {
    try { if (JSON.parse(hole.fairway_path).length >= 2) count++ } catch { /* */ }
  }
  if (hole.green_boundary) {
    try { if (JSON.parse(hole.green_boundary).length >= 3) count++ } catch { /* */ }
  }
  return count
}
