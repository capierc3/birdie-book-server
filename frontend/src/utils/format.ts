// Score vs par formatting
export function formatVsPar(v: number | null | undefined): string {
  if (v == null) return '--'
  if (v === 0) return 'E'
  return v > 0 ? `+${v}` : `${v}`
}

// SG value formatting
export function formatSG(v: number | null | undefined): string {
  if (v == null) return '--'
  const s = v.toFixed(1)
  return v > 0 ? `+${s}` : s
}

// Percentage formatting
export function formatPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '--'
  return `${v.toFixed(decimals)}%`
}

// Date formatting
export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Number with fixed decimals
export function formatNum(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '--'
  return v.toFixed(decimals)
}

// Standard deviation from array of numbers
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// Score vs par color class
export function vsParColor(v: number | null | undefined): string {
  if (v == null) return ''
  if (v < 0) return 'score-birdie'
  if (v === 0) return 'score-par'
  if (v === 1) return 'score-bogey'
  return 'score-double'
}

// SG value color (inline style)
export function sgColor(v: number | null | undefined): string {
  if (v == null || v === 0) return 'var(--text-dim)'
  return v > 0 ? 'var(--birdie)' : 'var(--bogey)'
}

// Game format labels
const FORMAT_LABELS: Record<string, string> = {
  STROKE_PLAY: 'Stroke',
  SCRAMBLE: 'Scramble',
  MATCH_PLAY: 'Match',
  BEST_BALL: 'Best Ball',
  STABLEFORD: 'Stableford',
  OTHER: 'Other',
}

export function formatGameFormat(f: string | null | undefined): string {
  if (!f) return ''
  return FORMAT_LABELS[f] || f
}
