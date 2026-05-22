import type { CourseDetail } from '../../../api'
import type { LatLng } from '../courseMapState'
import { parseHoleData } from '../courseMapState'
import { pointToSegmentDist } from '../geoUtils'

const EARTH_RADIUS_M = 6378137
const M_TO_YARDS = 1.09361

/**
 * Project (lat, lng) into local meters relative to an origin lat/lng using a
 * simple equirectangular approximation. Accurate to <1m within a few km of the
 * origin, which is more than enough for a single hole or hole cluster.
 */
function toLocalMeters(originLat: number, originLng: number, lat: number, lng: number): [number, number] {
  const dLat = ((lat - originLat) * Math.PI) / 180
  const dLng = ((lng - originLng) * Math.PI) / 180
  const x = EARTH_RADIUS_M * dLng * Math.cos((originLat * Math.PI) / 180)
  const y = EARTH_RADIUS_M * dLat
  return [x, y]
}

/**
 * Min planar distance (yards) from a GPS point to a hole's corridor.
 *
 * Corridor centerline = tee → (optional fairway path points) → green. We take
 * the min distance from the GPS to any segment of that polyline. This naturally
 * follows doglegs when fairway_path is set, and falls back to a straight
 * tee→green segment otherwise.
 *
 * Returns null if the hole lacks tee/green coordinates.
 */
export function distanceToHoleCorridor(
  gps: { lat: number; lng: number },
  teePos: LatLng | null,
  greenPos: LatLng | null,
  fairwayPath: LatLng[],
): number | null {
  if (!teePos || !greenPos) return null

  // Project everything into a local frame anchored at the tee.
  const [gx, gy] = toLocalMeters(teePos.lat, teePos.lng, gps.lat, gps.lng)
  const points: Array<[number, number]> = [[0, 0]]
  for (const p of fairwayPath) {
    points.push(toLocalMeters(teePos.lat, teePos.lng, p.lat, p.lng))
  }
  points.push(toLocalMeters(teePos.lat, teePos.lng, greenPos.lat, greenPos.lng))

  let minMeters = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const d = pointToSegmentDist(
      gx, gy,
      points[i][0], points[i][1],
      points[i + 1][0], points[i + 1][1],
    )
    if (d < minMeters) minMeters = d
  }

  return minMeters * M_TO_YARDS
}

export interface HoleProximity {
  holeNum: number
  yardsFromCorridor: number
}

/**
 * Scan every hole on the course and return the closest one to the GPS point.
 * `teeId` is the active tee (different tees have different tee_lat/lng per hole).
 * Returns null when the course has no holes with usable geometry.
 */
export function findClosestHole(
  course: CourseDetail,
  teeId: number | undefined,
  gps: { lat: number; lng: number },
  totalHoles: number,
): HoleProximity | null {
  let best: HoleProximity | null = null
  for (let h = 1; h <= totalHoles; h++) {
    const parsed = parseHoleData(course, h, teeId)
    const d = distanceToHoleCorridor(gps, parsed.teePos, parsed.greenPos, parsed.fairwayPath)
    if (d == null) continue
    if (!best || d < best.yardsFromCorridor) {
      best = { holeNum: h, yardsFromCorridor: d }
    }
  }
  return best
}
