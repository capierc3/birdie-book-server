// Recharts dark theme constants
export const CHART_COLORS = {
  grid: '#1e293b',
  text: '#64748b',
  tooltip: {
    bg: '#1c1f26',
    border: '#2a2d35',
    text: '#e4e6eb',
  },
}

export const SG_COLORS: Record<string, string> = {
  off_the_tee: '#3b82f6',
  approach: '#f59e0b',
  short_game: '#10b981',
  putting: '#8b5cf6',
}

export const SG_LABELS: Record<string, string> = {
  off_the_tee: 'Off the Tee',
  approach: 'Approach',
  short_game: 'Short Game',
  putting: 'Putting',
}

export const SG_CATEGORIES = ['off_the_tee', 'approach', 'short_game', 'putting'] as const

export const SCORE_DIST_COLORS = {
  birdie_or_better: '#22c55e',
  par: '#3b82f6',
  bogey: '#f59e0b',
  double: '#ef4444',
  triple_plus: '#dc2626',
}
