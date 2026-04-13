import { useMemo, useRef, useEffect, useCallback } from 'react'
import { Card, CardHeader } from '../../components'
import type { RangeShotResponse } from '../../api'
import styles from './RangeDetailPage.module.css'

interface Props {
  shots: RangeShotResponse[]
  compareShots: RangeShotResponse[]
  highlightedShotIds: Set<string>
}

interface FlightPoint {
  x: number
  y: number
}

interface FlightPath {
  shotId: string
  club: string
  color: string
  isCompare: boolean
  points: FlightPoint[]
}

const METERS_TO_YARDS = 1.09361
const PADDING = { top: 20, right: 20, bottom: 35, left: 50 }

function generateBezier(carry: number, launchDeg: number, descentDeg: number): FlightPoint[] {
  // Exact port of old JS: cubic Bézier with CP1 at 30%, CP2 at 75% of carry
  const launchRad = (launchDeg || 12) * Math.PI / 180
  const descentRad = (descentDeg || 40) * Math.PI / 180

  const cp1x = carry * 0.3
  const cp1y = cp1x * Math.tan(launchRad)
  const cp2x = carry * 0.75
  const cp2y = (carry - cp2x) * Math.tan(descentRad)

  const steps = 30
  const points: FlightPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    // P0=(0,0), CP1, CP2, P1=(carry,0)
    const x = mt ** 3 * 0 + 3 * mt ** 2 * t * cp1x + 3 * mt * t ** 2 * cp2x + t ** 3 * carry
    const y = mt ** 3 * 0 + 3 * mt ** 2 * t * cp1y + 3 * mt * t ** 2 * cp2y + t ** 3 * 0
    points.push({ x, y })
  }
  return points
}

interface PolyFitEntry {
  xFit: number[]
  yFit: number[]
  timeInterval: [number, number]
}

function evalPoly(coeffs: number[], t: number): number {
  let val = 0
  for (let i = 0; i < coeffs.length; i++) val += coeffs[i] * t ** i
  return val
}

function parseTrajectory(json: string): FlightPoint[] {
  try {
    const raw = JSON.parse(json) as unknown[]
    if (!Array.isArray(raw) || raw.length === 0) return []

    const first = raw[0] as Record<string, unknown>

    // Polynomial fit format (Trackman Range API): [{xFit, yFit, zFit, timeInterval}, ...]
    if ('xFit' in first) {
      const points: FlightPoint[] = []
      for (const entry of raw as PolyFitEntry[]) {
        const [t0, t1] = entry.timeInterval ?? [0, 3]
        const steps = 30
        for (let i = 0; i <= steps; i++) {
          const t = t0 + (t1 - t0) * (i / steps)
          const x = evalPoly(entry.xFit, t) * METERS_TO_YARDS
          const y = evalPoly(entry.yFit, t) * METERS_TO_YARDS
          if (y >= 0) points.push({ x, y })
        }
      }
      return points
    }

    // Discrete point format (regular Trackman API): [{X, Y, Z}, ...]
    if ('X' in first) {
      return (raw as { X: number; Y: number; Z: number }[]).map((p) => ({
        x: p.X * METERS_TO_YARDS,
        y: p.Y * METERS_TO_YARDS,
      }))
    }

    return []
  } catch {
    return []
  }
}

function buildFlightPath(shot: RangeShotResponse, isCompare: boolean): FlightPath | null {
  const carry = shot.carry_yards
  if (carry == null || carry <= 0) return null

  let points: FlightPoint[]
  if (shot.trajectory_json) {
    points = parseTrajectory(shot.trajectory_json)
    if (points.length === 0) return null
  } else if (shot.launch_angle_deg != null) {
    points = generateBezier(carry, shot.launch_angle_deg, shot.descent_angle_deg ?? 40)
  } else {
    return null
  }

  return {
    shotId: shot.id,
    club: shot.club_name ?? shot.club_type_raw,
    color: shot.club_color ?? '#888',
    isCompare,
    points,
  }
}

export function TrajectoryChart({ shots, compareShots, highlightedShotIds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const paths = useMemo(() => {
    const result: FlightPath[] = []
    for (const s of shots) {
      const p = buildFlightPath(s, false)
      if (p) result.push(p)
    }
    for (const s of compareShots) {
      const p = buildFlightPath(s, true)
      if (p) result.push(p)
    }
    return result
  }, [shots, compareShots])

  const legendClubs = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of paths) map.set(p.club, p.color)
    return Array.from(map.entries())
  }, [paths])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const plotW = w - PADDING.left - PADDING.right
    const plotH = h - PADDING.top - PADDING.bottom

    // Compute domains from data (matching old: maxCarry*1.1 rounded to 50, maxApex*1.3 rounded to 10)
    let maxCarry = 50, maxApex = 10
    for (const path of paths) {
      for (const p of path.points) {
        if (p.x > maxCarry) maxCarry = p.x
        if (p.y > maxApex) maxApex = p.y
      }
    }
    const xMax = Math.ceil(maxCarry * 1.1 / 50) * 50
    const yMax = Math.ceil(maxApex * 1.3 / 10) * 10
    const yStep = maxApex > 30 ? 10 : 5

    const toX = (v: number) => PADDING.left + (v / xMax) * plotW
    const toY = (v: number) => PADDING.top + plotH - (v / yMax) * plotH

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Grid lines (matching old: color #e0e0e0)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= xMax; x += 50) {
      const cx = toX(x)
      ctx.beginPath(); ctx.moveTo(cx, PADDING.top); ctx.lineTo(cx, PADDING.top + plotH); ctx.stroke()
    }
    for (let y = 0; y <= yMax; y += yStep) {
      const cy = toY(y)
      ctx.beginPath(); ctx.moveTo(PADDING.left, cy); ctx.lineTo(PADDING.left + plotW, cy); ctx.stroke()
    }

    // Axis tick labels
    ctx.fillStyle = '#aaa'
    ctx.font = '10px system-ui'
    ctx.textAlign = 'center'
    for (let x = 0; x <= xMax; x += 50) {
      ctx.fillText(`${x}`, toX(x), PADDING.top + plotH + 14)
    }
    ctx.textAlign = 'right'
    for (let y = 0; y <= yMax; y += yStep) {
      ctx.fillText(`${y}`, PADDING.left - 6, toY(y) + 4)
    }

    // Axis titles
    ctx.fillStyle = '#aaa'
    ctx.font = '11px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Distance (yds)', PADDING.left + plotW / 2, h - 2)
    ctx.save()
    ctx.translate(12, PADDING.top + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText('Height (yds)', 0, 0)
    ctx.restore()

    // Draw flight paths
    const hasHighlight = highlightedShotIds.size > 0
    for (const path of paths) {
      const isHl = !hasHighlight || highlightedShotIds.has(path.shotId)

      ctx.strokeStyle = isHl
        ? path.color
        : path.color + '15'
      ctx.lineWidth = hasHighlight ? (isHl ? 3 : 1) : 2
      if (path.isCompare) {
        ctx.setLineDash([6, 3])
        if (!hasHighlight) {
          ctx.lineWidth = 1.5
          ctx.strokeStyle = path.color + '80'
        }
      } else {
        ctx.setLineDash([])
      }

      ctx.beginPath()
      for (let i = 0; i < path.points.length; i++) {
        const px = toX(path.points[i].x)
        const py = toY(path.points[i].y)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
  }, [paths, highlightedShotIds])

  useEffect(() => {
    draw()
    const obs = new ResizeObserver(draw)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [draw])

  return (
    <Card>
      <CardHeader title="Ball Flight" />
      <div ref={containerRef} style={{ width: '100%', height: 400, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
      <div className={styles.legend}>
        {legendClubs.map(([club, color]) => (
          <span key={club} className={styles.legendItem}>
            <span className={styles.clubDot} style={{ background: color }} />
            {club}
          </span>
        ))}
        {compareShots.length > 0 && (
          <span className={styles.legendNote}>{'\u2014'} = Primary &nbsp; - - = Compare</span>
        )}
      </div>
    </Card>
  )
}
