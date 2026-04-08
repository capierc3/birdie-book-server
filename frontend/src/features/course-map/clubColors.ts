/** Default club color map */
const DEFAULT_CLUB_COLORS: Record<string, string> = {
  Driver: '#e53935',
  '3 Wood': '#f4511e',
  '5 Wood': '#fb8c00',
  '7 Wood': '#ff9800',
  '3 Hybrid': '#43a047',
  '4 Hybrid': '#66bb6a',
  '5 Hybrid': '#81c784',
  '2 Iron': '#00695c',
  '3 Iron': '#00897b',
  '4 Iron': '#26a69a',
  '5 Iron': '#42a5f5',
  '6 Iron': '#1e88e5',
  '7 Iron': '#1565c0',
  '8 Iron': '#0d47a1',
  '9 Iron': '#283593',
  'PW': '#7b1fa2',
  'GW': '#8e24aa',
  'SW': '#ab47bc',
  'LW': '#ce93d8',
  'Putter': '#78909c',
}

/** Runtime cache of club colors from strategy API */
let clubColorCache: Record<string, string> = {}

/** Set club colors from strategy API data */
export function setClubColorCache(clubs: { club_type: string; color?: string | null }[]) {
  clubColorCache = {}
  clubs.forEach((c) => {
    if (c.color) clubColorCache[c.club_type] = c.color
  })
}

/** Get color for a club type (checks API cache first, then defaults, then hash) */
export function getClubColor(club: string | null | undefined): string {
  if (!club) return '#888'
  if (clubColorCache[club]) return clubColorCache[club]
  if (DEFAULT_CLUB_COLORS[club]) return DEFAULT_CLUB_COLORS[club]
  // Fallback: hash-based color
  let h = 0
  for (let i = 0; i < club.length; i++) h = club.charCodeAt(i) + ((h << 5) - h)
  return `hsl(${Math.abs(h) % 360}, 65%, 55%)`
}

/** Classify a shot into SG category */
export function classifySgCategory(
  shot: { shot_type?: string | null; green_distance_yards?: number | null; on_green?: boolean | null },
  par: number,
): string | null {
  if (shot.shot_type === 'PENALTY') return null
  if (shot.shot_type === 'PUTT') return 'putting'
  if (shot.shot_type === 'TEE' && par >= 4) return 'off_the_tee'
  if (shot.shot_type === 'TEE' && par === 3) return 'approach'
  if (shot.shot_type === 'APPROACH' || shot.shot_type === 'LAYUP') return 'approach'
  if (shot.shot_type === 'CHIP') return 'short_game'
  if (shot.green_distance_yards != null && shot.green_distance_yards <= 50 && !shot.on_green) return 'short_game'
  if (['RECOVERY', 'UNKNOWN'].includes(shot.shot_type ?? '') || shot.green_distance_yards != null) return 'approach'
  return null
}
