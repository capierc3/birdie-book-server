/**
 * caddieCalc.ts — Shared caddie/strategy calculation functions.
 * Pure functions, no React/Leaflet dependencies.
 * Used by: GpsRangefinder, CaddieTab, InsightsPanel, StrategyOverlays, MobileStrategyOverlays
 */

import { haversineYards, bearing, normalCDF } from './geoUtils'
import type { PlayerClub, MissTendency, LateralDispersion } from './useCourseStrategy'

// ── Types ──

export interface ClubStats {
  type: string
  color: string
  avg: number
  std: number
  p10: number
  p90: number
  lateralStd: number
  lateralMean: number
  missLeft: number
  missRight: number
  missCenter: number
}

export interface RankedClub {
  type: string
  avg: number
  diff: number
  delta: number // signed: avg - targetDist
  matchPct: number
  sampleCount: number
}

export interface CarryResult {
  type: string
  avg: number
  pct: number // probability of carrying target distance (0-100)
}

export interface HazardResult {
  type: string
  name?: string | null
  distance: number
  cls: '' | 'danger' | 'warning'
}

export type ShotContext = 'tee' | 'approach' | 'short_game' | 'green'

interface LatLng {
  lat: number
  lng: number
}

interface HazardInput {
  hazard_type: string
  name?: string | null
  boundary: LatLng[]
  _deleted?: boolean
}

// ── Core calculations ──

/** Normalize a club entry with fallback defaults for missing stats */
export function getClubStats(
  club: PlayerClub,
  lateralDispersion?: LateralDispersion | null,
  missTendency?: MissTendency | null,
): ClubStats {
  const avg = club.avg_yards
  const std = club.std_dev || avg * 0.08
  return {
    type: club.club_type,
    color: club.color || '#4CAF50',
    avg,
    std,
    p10: club.p10 || avg * 0.88,
    p90: club.p90 || avg * 1.12,
    lateralStd: Math.min(
      lateralDispersion?.lateral_std_dev || (std * 0.15) || 8,
      avg * 0.12,
    ),
    lateralMean: lateralDispersion?.lateral_mean || 0,
    missLeft: missTendency?.left_pct || 33,
    missRight: missTendency?.right_pct || 33,
    missCenter: missTendency?.center_pct || 34,
  }
}

/**
 * Determine shot context. When `distFromTee` is provided, "tee" is locked to
 * actually being near the tee — long-approach (>350y from green) no longer
 * collapses back to "tee" and lets Driver be recommended from the fairway.
 */
export function determineShotContext(
  distToGreen: number,
  hasBallPlaced: boolean,
  distFromTee?: number,
): ShotContext {
  if (!hasBallPlaced) return 'tee'
  if (distFromTee != null && distFromTee < 30) return 'tee'
  if (distToGreen <= 10) return 'green'
  if (distToGreen <= 50) return 'short_game'
  if (distToGreen <= 350) return 'approach'
  // Long approach: only treat as "tee" when caller can't tell us where the
  // tee is. With distFromTee provided we know we're not on the tee.
  return distFromTee != null ? 'approach' : 'tee'
}

/** Hazard types that turn a tee shot into a stroke-and-distance / lost-ball
 * penalty if you land in them. Bunkers and waste areas are recoverable and
 * don't force a layup. */
const LAYUP_HAZARD_TYPES = new Set(['water', 'out_of_bounds', 'trees'])

/** Smallest angular separation between two bearings (radians, signed −π..π). */
function angularDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

/** Compute layup-aware target for a given longest club + corridor hazards. */
function targetWithLayup(
  longest: PlayerClub,
  longestStd: number,
  corridorHazards: HazardResult[],
  cap: number,
): number {
  const landingMin = longest.avg_yards - longestStd
  const landingMax = longest.avg_yards + longestStd
  const dangerous = corridorHazards.filter(h =>
    LAYUP_HAZARD_TYPES.has(h.type) && h.distance >= landingMin && h.distance <= landingMax,
  )
  if (dangerous.length > 0) {
    const closest = Math.min(...dangerous.map(h => h.distance))
    return Math.max(50, closest - 20)
  }
  return Math.min(longest.avg_yards, cap)
}

export interface TeeStrategy {
  /** Where to aim for this tee shot. */
  aimPoint: LatLng
  /** Target distance for ranking clubs. */
  targetYards: number
  /** Hazards detected on the chosen aim corridor. */
  corridorHazards: HazardResult[]
  /** 'cut' = aim past dogleg corner; 'safe' = aim at corner; 'straight' = no dogleg. */
  line: 'cut' | 'safe' | 'straight'
  /** Short user-facing reason. Empty when no dogleg decision was needed. */
  reason: string
}

/** Minimum bend (radians) before a fairway-path waypoint is treated as a dogleg corner. */
const DOGLEG_MIN_BEND = (15 * Math.PI) / 180
/** Minimum yards saved by cutting the corner before we'll recommend cutting. */
const MIN_CUT_SAVINGS = 15
/** Buffer added when computing required carry over an inside-corner penalty hazard. */
const CARRY_BUFFER = 10

/**
 * Decide a tee-shot aim and target — handles doglegs.
 *
 * Cut vs. safe decision:
 * - **Required carry** = farthest penalty hazard along the `tee → green` cut line + buffer.
 * - **Conservative carry** = `longest.avg − longest.std` (carries this ~84% of the time).
 * - **Cut savings** = `(tee→corner + corner→green) − (tee→green)`.
 *
 * Cut when `conservativeCarry > requiredCarry` AND `cutSavings ≥ MIN_CUT_SAVINGS`.
 * Otherwise play safe to the corner.
 */
export function getTeeStrategy(
  par: number,
  yardage: number,
  origin: LatLng,
  greenPos: LatLng,
  fairwayPath: LatLng[],
  hazards: HazardInput[],
  clubs: PlayerClub[],
): TeeStrategy {
  // Par 3 — always aim at green, target = yardage.
  if (par === 3) {
    const aimBearing = bearing(origin.lat, origin.lng, greenPos.lat, greenPos.lng)
    return {
      aimPoint: greenPos,
      targetYards: yardage,
      corridorHazards: findNearbyHazards(origin, hazards, 'tee', { aimBearing, corridorYards: 30 }),
      line: 'straight',
      reason: '',
    }
  }

  const candidates = clubs.filter(c => c.club_type !== 'Unknown' && c.avg_yards > 0)
  const longest = candidates.reduce<PlayerClub | null>((best, c) =>
    !best || c.avg_yards > best.avg_yards ? c : best, null)

  if (!longest) {
    // No club data — straight aim with legacy fallback target.
    const aimBearing = bearing(origin.lat, origin.lng, greenPos.lat, greenPos.lng)
    return {
      aimPoint: greenPos,
      targetYards: par === 4 ? yardage - 140 : Math.min(yardage * 0.55, 280),
      corridorHazards: findNearbyHazards(origin, hazards, 'tee', { aimBearing, corridorYards: 30 }),
      line: 'straight',
      reason: '',
    }
  }

  const longestStd = longest.std_dev || longest.avg_yards * 0.08

  // Find the first fairwayPath waypoint that bends meaningfully off tee→green.
  const cutBearing = bearing(origin.lat, origin.lng, greenPos.lat, greenPos.lng)
  let corner: LatLng | null = null
  for (const wp of fairwayPath) {
    const wpBearing = bearing(origin.lat, origin.lng, wp.lat, wp.lng)
    if (Math.abs(angularDiff(wpBearing, cutBearing)) > DOGLEG_MIN_BEND) {
      corner = wp
      break
    }
  }

  // No dogleg — straight tee → green.
  if (!corner) {
    const corridorHazards = findNearbyHazards(origin, hazards, 'tee', { aimBearing: cutBearing, corridorYards: 30 })
    return {
      aimPoint: greenPos,
      targetYards: targetWithLayup(longest, longestStd, corridorHazards, yardage),
      corridorHazards,
      line: 'straight',
      reason: '',
    }
  }

  // Dogleg detected. The cut/safe decision hinges on penalty hazards inside
  // the cut corridor — a slight bend with no trouble should still aim at green.
  const distToCorner = haversineYards(origin.lat, origin.lng, corner.lat, corner.lng)
  const distToGreen = haversineYards(origin.lat, origin.lng, greenPos.lat, greenPos.lng)
  const cornerToGreen = haversineYards(corner.lat, corner.lng, greenPos.lat, greenPos.lng)
  const cutSavings = (distToCorner + cornerToGreen) - distToGreen

  const cutHazards = findNearbyHazards(origin, hazards, 'tee', { aimBearing: cutBearing, corridorYards: 30 })
  const penaltyOnCut = cutHazards.filter(h => LAYUP_HAZARD_TYPES.has(h.type))

  // No penalty trouble on the cut line — no reason to lay up to the corner.
  if (penaltyOnCut.length === 0) {
    return {
      aimPoint: greenPos,
      targetYards: targetWithLayup(longest, longestStd, cutHazards, yardage),
      corridorHazards: cutHazards,
      line: cutSavings >= MIN_CUT_SAVINGS ? 'cut' : 'straight',
      reason: cutSavings >= MIN_CUT_SAVINGS ? `Cut the corner — saves ${Math.round(cutSavings)}y` : '',
    }
  }

  const requiredCarry = Math.max(...penaltyOnCut.map(h => h.distance)) + CARRY_BUFFER
  const closestPenalty = Math.min(...penaltyOnCut.map(h => h.distance))
  const conservativeCarry = longest.avg_yards - longestStd

  if (conservativeCarry > requiredCarry) {
    return {
      aimPoint: greenPos,
      targetYards: targetWithLayup(longest, longestStd, cutHazards, yardage),
      corridorHazards: cutHazards,
      line: 'cut',
      reason: `Cut the corner — needs ${Math.round(requiredCarry)}y carry`,
    }
  }

  // Can't carry the trouble — play short of it. Aim at the corner so we stay
  // in the fairway, but the target distance is bounded by the closest penalty.
  const safeBearing = bearing(origin.lat, origin.lng, corner.lat, corner.lng)
  const safeHazards = findNearbyHazards(origin, hazards, 'tee', { aimBearing: safeBearing, corridorYards: 30 })
  const safeTarget = Math.max(50, Math.min(longest.avg_yards, closestPenalty - 20))
  return {
    aimPoint: corner,
    targetYards: safeTarget,
    corridorHazards: safeHazards,
    line: 'safe',
    reason: `Play safe — ${Math.round(requiredCarry)}y carry too risky`,
  }
}

/**
 * Pick a target distance for the tee shot. Uses the player's longest club
 * to aim as close to the green as possible. Lays up only when a *penalty*
 * hazard sits inside the longest club's landing zone (`avg ± std`); bunkers
 * and waste areas are ignored since they're recoverable. Falls back to the
 * legacy formula when no club data is available.
 *
 * @deprecated Prefer `getTeeStrategy` which is dogleg-aware and returns
 *   the aim point + projected hazards as well.
 */
export function getTeeClubTarget(
  par: number,
  yardage: number,
  clubs?: PlayerClub[],
  hazards?: { type?: string; distance: number }[],
): number {
  if (par === 3) return yardage

  const candidates = (clubs || []).filter(c =>
    c.club_type !== 'Unknown' && c.avg_yards > 0,
  )
  const longest = candidates.reduce<PlayerClub | null>((best, c) => {
    if (!best || c.avg_yards > best.avg_yards) return c
    return best
  }, null)

  if (!longest) {
    if (par === 4) return yardage - 140
    return Math.min(yardage * 0.55, 280)
  }

  const maxStd = longest.std_dev || longest.avg_yards * 0.08
  const landingMin = longest.avg_yards - maxStd
  const landingMax = longest.avg_yards + maxStd

  // Lay up only when a *penalty* hazard sits in our landing zone.
  if (hazards && hazards.length > 0) {
    const dangerous = hazards.filter(h => {
      if (h.type && !LAYUP_HAZARD_TYPES.has(h.type)) return false
      return h.distance >= landingMin && h.distance <= landingMax
    })
    if (dangerous.length > 0) {
      const closest = Math.min(...dangerous.map(h => h.distance))
      return Math.max(50, closest - 20)
    }
  }

  // Otherwise aim for max distance, capped at the green.
  return Math.min(longest.avg_yards, yardage)
}

/**
 * Rank clubs by proximity to target distance.
 * Returns sorted array with match percentage (normalized by std_dev).
 */
export function rankClubs(
  clubs: PlayerClub[],
  targetDist: number,
  opts?: {
    count?: number
    excludeDriver?: boolean
    excludeUnknown?: boolean
    /** Tee-shot mode: penalize falling short more than going long. */
    preferLong?: boolean
    /** Clubs with fewer than this many recorded shots get a sample-size penalty. */
    minSampleCount?: number
  },
): RankedClub[] {
  const count = opts?.count ?? 5
  const excludeDriver = opts?.excludeDriver ?? false
  const excludeUnknown = opts?.excludeUnknown ?? true
  const preferLong = opts?.preferLong ?? false
  const minSampleCount = opts?.minSampleCount ?? 10

  return clubs
    .filter(cl => {
      if (!cl.avg_yards) return false
      if (excludeUnknown && cl.club_type === 'Unknown') return false
      if (excludeDriver && cl.club_type === 'Driver') return false
      return true
    })
    .map(cl => {
      const sampleCount = cl.sample_count ?? 0
      const delta = cl.avg_yards - targetDist
      const diff = Math.abs(delta)
      // Sample-size penalty: 3y per missing shot below minSampleCount.
      // Adds 30y at 0 shots, 15y at 5 shots, 0y at 10+ shots.
      const samplePenalty = Math.max(0, minSampleCount - sampleCount) * 3
      // Asymmetric: when off the tee, hitting short is worse than going slightly long.
      const directionPenalty = preferLong && delta < 0 ? Math.abs(delta) * 0.3 : 0
      const effDiff = diff + samplePenalty + directionPenalty
      const std = cl.std_dev || cl.avg_yards * 0.08
      const matchPct = Math.max(0, Math.round(100 - (diff / std) * 25))
      return {
        ranked: {
          type: cl.club_type,
          avg: cl.avg_yards,
          diff,
          delta: Math.round(delta),
          matchPct,
          sampleCount,
        },
        effDiff,
      }
    })
    .sort((a, b) => a.effDiff - b.effDiff)
    .slice(0, count)
    .map(r => r.ranked)
}

/**
 * Compute carry probability for each club at a target distance.
 * Returns probability of carrying MORE than the target distance.
 */
export function computeCarryProbabilities(
  clubs: PlayerClub[],
  targetDist: number,
  opts?: { maxResults?: number },
): CarryResult[] {
  const maxResults = opts?.maxResults ?? 8
  const rows: CarryResult[] = []

  for (const cl of clubs) {
    const std = cl.std_dev || cl.avg_yards * 0.08
    if (std === 0) continue
    const zScore = (targetDist - cl.avg_yards) / std
    const pct = Math.round((1 - normalCDF(zScore)) * 100)
    if (pct < 1 || pct > 99) continue
    rows.push({ type: cl.club_type, avg: cl.avg_yards, pct })
  }

  return rows.sort((a, b) => b.pct - a.pct).slice(0, maxResults)
}

/**
 * Find nearby hazards from an origin point.
 * Uses context-aware distance thresholds.
 *
 * When `aimBearing` is provided (radians, origin → target), only hazards
 * within `corridorYards` (default 30y) lateral of the aim line are returned,
 * and the reported distance is the *forward* projection onto the aim line —
 * not the radial distance. This filters out hazards on adjacent holes.
 */
export function findNearbyHazards(
  origin: LatLng,
  hazards: HazardInput[],
  context: ShotContext = 'tee',
  opts?: { aimBearing?: number; corridorYards?: number },
): HazardResult[] {
  const maxDist = context === 'tee' ? 350 : 200
  const aimBearing = opts?.aimBearing
  const corridor = opts?.corridorYards ?? 30
  const result: HazardResult[] = []

  for (const h of hazards) {
    if (h._deleted || h.boundary.length < 3) continue

    let reportDist = Infinity
    if (aimBearing == null) {
      for (const p of h.boundary) {
        const d = haversineYards(origin.lat, origin.lng, p.lat, p.lng)
        if (d < reportDist) reportDist = d
      }
    } else {
      // Project each boundary point onto the aim line; keep only points within
      // the corridor and ahead of the origin. Reported distance = nearest
      // forward projection.
      for (const p of h.boundary) {
        const d = haversineYards(origin.lat, origin.lng, p.lat, p.lng)
        const ptBear = bearing(origin.lat, origin.lng, p.lat, p.lng)
        const delta = ptBear - aimBearing
        const forward = d * Math.cos(delta)
        const lateral = Math.abs(d * Math.sin(delta))
        if (forward > 0 && lateral <= corridor && forward < reportDist) {
          reportDist = forward
        }
      }
    }

    if (reportDist > 20 && reportDist < maxDist) {
      const dist = Math.round(reportDist)
      result.push({
        type: h.hazard_type,
        name: h.name,
        distance: dist,
        cls: dist < 30 ? 'danger' : dist < 80 ? 'warning' : '',
      })
    }
  }

  return result.sort((a, b) => a.distance - b.distance)
}

/**
 * Compute green front/back by projecting boundary onto GPS→flag line.
 */
export function computeGreenFrontBack(
  gpsLat: number, gpsLng: number,
  flagLat: number, flagLng: number,
  greenBoundary: LatLng[],
): { front: number; back: number } {
  const centerDist = haversineYards(gpsLat, gpsLng, flagLat, flagLng)
  if (greenBoundary.length < 3) {
    return { front: Math.max(0, centerDist - 10), back: centerDist + 10 }
  }

  const bear = bearing(gpsLat, gpsLng, flagLat, flagLng)
  let minProj = Infinity
  let maxProj = -Infinity

  for (const pt of greenBoundary) {
    const dist = haversineYards(gpsLat, gpsLng, pt.lat, pt.lng)
    const ptBear = bearing(gpsLat, gpsLng, pt.lat, pt.lng)
    const proj = dist * Math.cos(ptBear - bear)
    if (proj < minProj) minProj = proj
    if (proj > maxProj) maxProj = proj
  }

  return {
    front: Math.max(0, Math.round(minProj)),
    back: Math.round(maxProj),
  }
}
