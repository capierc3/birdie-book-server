import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { Card, CardHeader } from '../../components'
import type { RangeShotResponse } from '../../api'
import { CHART_COLORS } from '../../utils/chartTheme'
import { formatNum } from '../../utils/format'
import styles from './RangeDetailPage.module.css'

interface Props {
  shots: RangeShotResponse[]
  compareShots: RangeShotResponse[]
  viewMode: 'total' | 'carry'
  highlightedShotIds: Set<string>
  onShotClick: (shotId: string) => void
  onViewModeChange: (mode: 'total' | 'carry') => void
}

interface PlotPoint {
  x: number
  y: number
  shotId: string
  club: string
  color: string
  isCompare: boolean
}

const PADDING = { top: 10, right: 10, bottom: 5, left: 10 }

export function DispersionChart({
  shots, compareShots, viewMode, highlightedShotIds, onShotClick, onViewModeChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pointsRef = useRef<PlotPoint[]>([])
  const scaleRef = useRef<{ toX: (v: number) => number; toY: (v: number) => number } | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: PlotPoint } | null>(null)

  const yKey = viewMode === 'carry' ? 'carry_yards' : 'total_yards'

  const allPoints = useMemo(() => {
    const points: PlotPoint[] = []
    for (const s of shots) {
      if (s.side_carry_yards != null && s[yKey] != null) {
        points.push({
          x: s.side_carry_yards!, y: s[yKey]!,
          shotId: s.id, club: s.club_name ?? s.club_type_raw,
          color: s.club_color ?? '#888', isCompare: false,
        })
      }
    }
    for (const s of compareShots) {
      if (s.side_carry_yards != null && s[yKey] != null) {
        points.push({
          x: s.side_carry_yards!, y: s[yKey]!,
          shotId: s.id, club: s.club_name ?? s.club_type_raw,
          color: s.club_color ?? '#888', isCompare: true,
        })
      }
    }
    pointsRef.current = points
    return points
  }, [shots, compareShots, yKey])

  const legendClubs = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of allPoints) map.set(p.club, p.color)
    return Array.from(map.entries())
  }, [allPoints])

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

    // Compute domains — match old: suggestedMin/Max -30/+30 for X, beginAtZero for Y
    let maxSide = 30
    let maxY = 0
    for (const p of allPoints) {
      if (Math.abs(p.x) > maxSide) maxSide = Math.ceil(Math.abs(p.x) / 10) * 10
      if (p.y > maxY) maxY = p.y
    }
    if (maxY === 0) maxY = 300
    // Add padding to Y
    maxY = Math.ceil(maxY * 1.1 / 50) * 50

    // Origin: x=0 is center, y=0 is bottom
    const originX = PADDING.left + plotW / 2
    const originY = PADDING.top + plotH

    const toX = (v: number) => originX + (v / maxSide) * (plotW / 2)
    const toY = (v: number) => originY - (v / maxY) * plotH
    scaleRef.current = { toX, toY }

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Concentric arcs every 50 yards (matching old arcPlugin exactly)
    ctx.save()
    ctx.strokeStyle = '#666'
    ctx.lineWidth = 1
    ctx.font = '10px system-ui'
    ctx.fillStyle = '#aaa'
    ctx.textAlign = 'left'

    for (let d = 50; d <= maxY; d += 50) {
      const r = Math.abs(originY - toY(d))
      ctx.beginPath()
      ctx.arc(originX, originY, r, Math.PI, 2 * Math.PI) // Top half arc
      ctx.stroke()
      // Distance label just right of center
      ctx.fillText(`${d}`, originX + 4, toY(d) + 12)
    }

    // Center dashed line (vertical from top to origin)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#999'
    ctx.beginPath()
    ctx.moveTo(originX, PADDING.top)
    ctx.lineTo(originX, originY)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // Draw points
    const hasHighlight = highlightedShotIds.size > 0
    for (const p of allPoints) {
      const cx = toX(p.x)
      const cy = toY(p.y)
      const isHl = !hasHighlight || highlightedShotIds.has(p.shotId)

      if (p.isCompare) {
        // Diamond (rectRot style) — hollow with border
        const radius = hasHighlight ? (isHl ? 8 : 4) : 6
        const alpha = isHl ? (hasHighlight ? 1 : 0.7) : 0.12
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.strokeStyle = p.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, cy - radius)
        ctx.lineTo(cx + radius, cy)
        ctx.lineTo(cx, cy + radius)
        ctx.lineTo(cx - radius, cy)
        ctx.closePath()
        ctx.stroke()
        ctx.restore()
      } else {
        // Filled circle — matching old: backgroundColor = color + 'B3', border = color
        const radius = hasHighlight ? (isHl ? 8 : 4) : 6
        ctx.save()
        if (hasHighlight && !isHl) {
          ctx.globalAlpha = 0.12
        }
        // Fill with semi-transparent color
        ctx.fillStyle = p.color + (hasHighlight && isHl ? '' : 'B3')
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
        // Border
        ctx.strokeStyle = p.color
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [allPoints, highlightedShotIds, viewMode])

  useEffect(() => {
    draw()
    const obs = new ResizeObserver(draw)
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [draw])

  // Click handler — find nearest point
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const scale = scaleRef.current
    if (!canvas || !scale) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let best: PlotPoint | null = null
    let bestDist = 15
    for (const p of pointsRef.current) {
      const cx = scale.toX(p.x)
      const cy = scale.toY(p.y)
      const d = Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2)
      if (d < bestDist) { bestDist = d; best = p }
    }
    if (best) onShotClick(best.shotId)
  }, [onShotClick])

  // Hover handler for tooltip
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    const scale = scaleRef.current
    if (!canvas || !scale) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let best: PlotPoint | null = null
    let bestDist = 15
    for (const p of pointsRef.current) {
      const cx = scale.toX(p.x)
      const cy = scale.toY(p.y)
      const d = Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2)
      if (d < bestDist) { bestDist = d; best = p }
    }
    if (best) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: best })
    } else {
      setTooltip(null)
    }
  }, [])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  return (
    <Card>
      <CardHeader
        title="Dispersion"
        action={
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewBtn} ${viewMode === 'total' ? styles.viewBtnActive : ''}`}
              onClick={() => onViewModeChange('total')}
            >
              Total
            </button>
            <button
              className={`${styles.viewBtn} ${viewMode === 'carry' ? styles.viewBtnActive : ''}`}
              onClick={() => onViewModeChange('carry')}
            >
              Carry
            </button>
          </div>
        }
      />
      <div ref={containerRef} style={{ width: '100%', height: 400, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
        {tooltip && (
          <div style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: CHART_COLORS.tooltip.bg,
            border: `1px solid ${CHART_COLORS.tooltip.border}`,
            borderRadius: 6,
            padding: '6px 10px',
            color: CHART_COLORS.tooltip.text,
            fontSize: '0.8rem',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 600, color: tooltip.point.color }}>{tooltip.point.club}</div>
            <div>{viewMode === 'carry' ? 'Carry' : 'Total'}: {formatNum(tooltip.point.y, 1)} yds</div>
            <div>Side: {formatNum(tooltip.point.x, 1)} yds</div>
            {tooltip.point.isCompare && <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Compare session</div>}
          </div>
        )}
      </div>
      <div className={styles.legend}>
        {legendClubs.map(([club, color]) => (
          <span key={club} className={styles.legendItem}>
            <span className={styles.clubDot} style={{ background: color }} />
            {club}
          </span>
        ))}
        {compareShots.length > 0 && (
          <span className={styles.legendNote}>&#9679; = Primary &nbsp; &#9670; = Compare</span>
        )}
      </div>
    </Card>
  )
}
