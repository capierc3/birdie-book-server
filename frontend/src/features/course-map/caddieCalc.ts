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

/** Determine shot context based on distance to green */
export function determineShotContext(distToGreen: number, hasBallPlaced: boolean): ShotContext {
  if (!hasBallPlaced) return 'tee'
  if (distToGreen <= 10) return 'green'
  if (distToGreen <= 50) return 'short_game'
  if (distToGreen <= 350) return 'approach'
  return 'tee'
}

/** Calculate target distance for tee shot based on par/yardage */
export function getTeeClubTarget(par: number, yardage: number): number {
  if (par === 3) return yardage
  if (par === 4) return yardage - 140
  return Math.min(yardage * 0.55, 280)
}

/**
 * Rank clubs by proximity to target distance.
 * Returns sorted array with match percentage (normalized by std_dev).
 */
export function rankClubs(
  clubs: PlayerClub[],
  targetDist: number,
  opts?: { count?: number; excludeDriver?: boolean; excludeUnknown?: boolean },
): RankedClub[] {
  const count = opts?.count ?? 5
  const excludeDriver = opts?.excludeDriver ?? false
  const excludeUnknown = opts?.excludeUnknown ?? true

  return clubs
    .filter(cl => {
      if (!cl.avg_yards) return false
      if (excludeUnknown && cl.club_type === 'Unknown') return false
      if (excludeDriver && cl.club_type === 'Driver') return false
      return true
    })
    .map(cl => {
      const diff = Math.abs(cl.avg_yards - targetDist)
      const std = cl.std_dev || cl.avg_yards * 0.08
      const matchPct = Math.max(0, Math.round(100 - (diff / std) * 25))
      return {
        type: cl.club_type,
        avg: cl.avg_yards,
        diff,
        delta: Math.round(cl.avg_yards - targetDist),
        matchPct,
      }
    })
    .sort((a, b) => a.diff - b.diff)
    .slice(0, count)
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
 */
export function findNearbyHazards(
  origin: LatLng,
  hazards: HazardInput[],
  context: ShotContext = 'tee',
): HazardResult[] {
  const maxDist = context === 'tee' ? 350 : 200
  const result: HazardResult[] = []

  for (const h of hazards) {
    if (h._deleted || h.boundary.length < 3) continue
    let minDist = Infinity
    for (const p of h.boundary) {
      const d = haversineYards(origin.lat, origin.lng, p.lat, p.lng)
      if (d < minDist) minDist = d
    }
    if (minDist > 20 && minDist < maxDist) {
      const dist = Math.round(minDist)
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
