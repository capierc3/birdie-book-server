import type { HandicapTrendPoint } from '../../api'

export type AxisMode = 'rounds' | 'date'
export type RangeValue = '5' | '10' | '20' | 'all' | '1m' | '3m' | '6m' | '1y'

/** Slice a trend list to match the user's chart-range selection. Mirrors the
 * slicing inside HandicapTrendChart so the projection stays in sync with the
 * visible chart. Skips the chart-only "today extension" and "anchor before
 * cutoff" tricks — projection only cares about real round data inside the
 * window. */
export function filterTrend(
  trend: HandicapTrendPoint[],
  axisMode: AxisMode,
  rangeValue: RangeValue,
): HandicapTrendPoint[] {
  if (trend.length === 0 || rangeValue === 'all') return trend

  if (axisMode === 'rounds') {
    const n = parseInt(rangeValue, 10)
    if (!Number.isFinite(n) || n <= 0) return trend
    return trend.slice(-n)
  }

  const now = new Date()
  let cutoff: Date
  switch (rangeValue) {
    case '1m': cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break
    case '3m': cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break
    case '6m': cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break
    case '1y': cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break
    default: return trend
  }
  const cutoffMs = new Date(cutoff.toISOString().slice(0, 10) + 'T12:00:00Z').getTime()
  return trend.filter((t) => new Date(t.date + 'T12:00:00Z').getTime() >= cutoffMs)
}

/** Linear-regression slope (least squares) of handicap_index over a trend
 * slice. Uses the position in the slice as x — that's what the chart does
 * visually too. Returns null if fewer than 2 indexed points are present. */
export function regressSlope(trend: HandicapTrendPoint[]): number | null {
  const pts: [number, number][] = []
  trend.forEach((t, i) => {
    if (t.handicap_index != null) pts.push([i, t.handicap_index])
  })
  if (pts.length < 2) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const xMean = xs.reduce((a, b) => a + b, 0) / xs.length
  const yMean = ys.reduce((a, b) => a + b, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < pts.length; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean)
    den += (xs[i] - xMean) ** 2
  }
  if (den === 0) return null
  return num / den
}
