export const SESSION_TYPE_LABELS: Record<string, string> = {
  trackman_range: 'Trackman Range',
  outdoor_range: 'Outdoor Range',
  home_net: 'Home Net',
  short_game_area: 'Short Game Area',
  putting_green: 'Putting Green',
  simulator: 'Simulator',
}

export const SESSION_TYPES = Object.keys(SESSION_TYPE_LABELS)

/** Session types that use ball_count (vs duration_minutes) */
export const BALL_BASED_SESSIONS = new Set(['trackman_range', 'outdoor_range'])

export const BALL_DEFAULTS: Record<string, number> = {
  trackman_range: 80,
  outdoor_range: 60,
}

export const FOCUS_LABELS: Record<string, string> = {
  warm_up: 'Warm Up',
  distance_control: 'Distance Control',
  accuracy: 'Accuracy',
  tempo: 'Tempo',
  start_line: 'Start Line',
  trajectory: 'Trajectory',
  speed_control: 'Speed Control',
  lag_putting: 'Lag Putting',
  short_putt: 'Short Putt',
  chipping: 'Chipping',
  bunker: 'Bunker',
}

export const FOCUS_AREAS = Object.keys(FOCUS_LABELS)

export const FOCUS_COLORS: Record<string, string> = {
  warm_up: '#78909c',
  distance_control: '#42a5f5',
  accuracy: '#66bb6a',
  tempo: '#ffa726',
  start_line: '#ab47bc',
  trajectory: '#26c6da',
  speed_control: '#ef5350',
  lag_putting: '#8d6e63',
  short_putt: '#5c6bc0',
  chipping: '#9ccc65',
  bunker: '#ffca28',
}

export const PREDEFINED_TAGS: Record<string, string[]> = {
  Clubs: [
    'driver',
    'fairway_woods',
    'hybrid',
    'long_irons',
    'mid_irons',
    'short_irons',
    'wedges',
    'putter',
  ],
  Skills: [
    'distance',
    'accuracy',
    'spread',
    'tempo',
    'start_line',
    'trajectory',
    'speed_control',
    'consistency',
  ],
  Context: ['swing_change', 'new_club', 'scoring_zones', 'trouble_shots'],
}

export const TAG_DISPLAY: Record<string, string> = {
  driver: 'Driver',
  fairway_woods: 'Fairway Woods',
  hybrid: 'Hybrid',
  long_irons: 'Long Irons',
  mid_irons: 'Mid Irons',
  short_irons: 'Short Irons',
  wedges: 'Wedges',
  putter: 'Putter',
  distance: 'Distance',
  accuracy: 'Accuracy',
  spread: 'Spread',
  tempo: 'Tempo',
  start_line: 'Start Line',
  trajectory: 'Trajectory',
  speed_control: 'Speed Control',
  consistency: 'Consistency',
  swing_change: 'Swing Change',
  new_club: 'New Club',
  scoring_zones: 'Scoring Zones',
  trouble_shots: 'Trouble Shots',
}

export const PLAN_TYPE_LABELS: Record<string, string> = {
  round_prep: 'Round Prep',
  general: 'General Improvement',
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  generated: 'Generated',
  saved: 'Saved',
  completed: 'Completed',
}

export const STATUS_VARIANTS: Record<string, 'blue' | 'green' | 'yellow' | 'muted'> = {
  draft: 'muted',
  generated: 'yellow',
  saved: 'blue',
  completed: 'green',
}

export const SG_CATEGORY_LABELS: Record<string, string> = {
  off_the_tee: 'Off the Tee',
  approach: 'Approach',
  short_game: 'Short Game',
  putting: 'Putting',
}
