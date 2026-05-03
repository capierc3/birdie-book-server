// ============================================================
// Play Sessions
// ============================================================

export type PlaySessionState = 'PRE' | 'COURSE_OVERVIEW' | 'ACTIVE' | 'COMPLETE' | 'ABANDONED'

export interface PlaySessionPartner {
  id: number
  player_id?: number | null
  player_name: string
  is_teammate: boolean
}

export interface PlaySessionPartnerInput {
  player_id?: number | null
  player_name: string
  is_teammate?: boolean
}

export interface PlaySessionWeatherSample {
  id: number
  hole_number?: number | null
  sampled_at: string
  temp_f?: number | null
  wind_speed_mph?: number | null
  wind_gust_mph?: number | null
  wind_dir_deg?: number | null
  wind_dir_cardinal?: string | null
  precipitation_in?: number | null
  weather_code?: number | null
  weather_desc?: string | null
  humidity_pct?: number | null
  pressure_mb?: number | null
}

export interface PlaySessionSummary {
  id: number
  course_id?: number | null
  course_name?: string | null
  tee_id?: number | null
  tee_name?: string | null
  date: string
  game_format?: string | null
  holes_played?: number | null
  state: PlaySessionState
  score?: number | null
  overall_rating?: number | null
  garmin_round_id?: number | null
  created_at?: string | null
  updated_at?: string | null
}

export interface PlaySessionDetail extends PlaySessionSummary {
  body_rating?: number | null
  mind_rating?: number | null
  commitment_rating?: number | null
  intention_notes?: string | null
  score_goal?: number | null
  what_worked?: string | null
  what_struggled?: string | null
  key_takeaway?: string | null
  next_focus?: string | null
  post_session_notes?: string | null
  partners: PlaySessionPartner[]
  weather_samples: PlaySessionWeatherSample[]
  tag_ids: number[]
}

export interface PlaySessionCreate {
  course_id?: number | null
  tee_id?: number | null
  date?: string | null
  game_format?: string | null
  holes_played?: number | null
  body_rating?: number | null
  mind_rating?: number | null
  commitment_rating?: number | null
  intention_notes?: string | null
  partners?: PlaySessionPartnerInput[]
  tag_ids?: number[]
}

export interface PlaySessionUpdate {
  course_id?: number | null
  tee_id?: number | null
  date?: string | null
  game_format?: string | null
  holes_played?: number | null
  state?: PlaySessionState
  body_rating?: number | null
  mind_rating?: number | null
  commitment_rating?: number | null
  intention_notes?: string | null
  score_goal?: number | null
  overall_rating?: number | null
  what_worked?: string | null
  what_struggled?: string | null
  key_takeaway?: string | null
  next_focus?: string | null
  post_session_notes?: string | null
  score?: number | null
  garmin_round_id?: number | null
  tag_ids?: number[]
}

// ============================================================
// Rounds
// ============================================================

export interface RoundSummary {
  id: number
  garmin_id?: number | null
  course_id?: number | null
  course_name?: string | null
  tee_name?: string | null
  tee_id?: number | null
  date: string
  holes_completed?: number | null
  total_strokes?: number | null
  score_vs_par?: number | null
  course_rating?: number | null
  slope_rating?: number | null
  shots_tracked?: number | null
  source?: string | null
  exclude_from_stats: boolean
  game_format?: string | null
}

export interface Shot {
  id: number
  shot_number: number
  club?: string | null
  shot_type?: string | null
  start_lie?: string | null
  end_lie?: string | null
  start_lat?: number | null
  start_lng?: number | null
  end_lat?: number | null
  end_lng?: number | null
  distance_yards?: number | null
  pin_distance_yards?: number | null
  fairway_side?: string | null
  fairway_side_yards?: number | null
  fairway_progress_yards?: number | null
  nearest_hazard_type?: string | null
  nearest_hazard_name?: string | null
  nearest_hazard_yards?: number | null
  green_distance_yards?: number | null
  on_green?: boolean | null
  sg_pga?: number | null
  sg_personal?: number | null
}

export interface RoundHole {
  id: number
  hole_number: number
  strokes?: number | null
  handicap_strokes?: number | null
  putts?: number | null
  fairway?: string | null
  gir?: boolean | null
  penalty_strokes: number
  shots: Shot[]
}

export interface RoundDetail extends RoundSummary {
  handicapped_strokes?: number | null
  player_handicap?: number | null
  session_type?: string | null
  weather_temp_f?: number | null
  weather_description?: string | null
  overall_rating?: number | null
  key_takeaway?: string | null
  holes: RoundHole[]
}

// ============================================================
// Courses
// ============================================================

export interface Course {
  id: number
  display_name: string
  club_name: string
  course_name?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
  holes?: number | null
  par?: number | null
  slope_rating?: number | null
  course_rating?: number | null
  user_rating?: number | null
  user_notes?: string | null
  photo_url?: string | null
  slope_min?: number | null
  slope_max?: number | null
  tee_count: number
  golf_club_id: number
  osm_id?: number | null
  osm_boundary?: string | null
}

export interface CourseHole {
  id: number
  hole_number: number
  par: number
  yardage?: number | null
  handicap?: number | null
  flag_lat?: number | null
  flag_lng?: number | null
  tee_lat?: number | null
  tee_lng?: number | null
  fairway_path?: string | null
  fairway_boundary?: string | null
  green_boundary?: string | null
  osm_hole_id?: number | null
  data_source?: string | null
  notes?: string | null
}

export interface CourseTee {
  id: number
  tee_name: string
  course_rating?: number | null
  slope_rating?: number | null
  par_total?: number | null
  total_yards?: number | null
  inferred: boolean
  holes: CourseHole[]
}

export interface CourseHazard {
  id: number
  hazard_type: string
  name?: string | null
  boundary: string
  data_source?: string | null
}

export interface OSMHole {
  id: number
  osm_id?: number | null
  hole_number?: number | null
  par?: number | null
  tee_lat?: number | null
  tee_lng?: number | null
  green_lat?: number | null
  green_lng?: number | null
  waypoints?: string | null  // JSON [[lat, lng], ...] centerline
  green_boundary?: string | null  // JSON [[lat, lng], ...] polygon
}

export interface CourseDetail extends Course {
  tees: CourseTee[]
  hazards: CourseHazard[]
  osm_holes: OSMHole[]
}

export interface CourseHoleStats {
  hole_number: number
  par: number
  yardage?: number | null
  handicap?: number | null
  avg_score: number
  avg_vs_par: number
  birdie_pct: number
  par_pct: number
  bogey_pct: number
  double_plus_pct: number
  times_played: number
}

export interface CourseRoundStats {
  round_id: number
  date: string
  tee_name?: string | null
  holes_played: number
  score: number
  score_vs_par: number
  vs_par_per_hole: number
  gir_pct?: number | null
  fw_pct?: number | null
  putts?: number | null
  putts_per_hole?: number | null
}

export interface CourseSGCategory {
  per_round: number
  total: number
  personal_per_round?: number | null
  personal_total?: number | null
  shots: number
  round_count: number
}

export interface CourseStats {
  course_id: number
  course_name?: string | null
  club_name: string
  club_id: number
  par?: number | null
  holes?: number | null
  rounds_played: number
  avg_score?: number | null
  best_score?: number | null
  worst_score?: number | null
  avg_vs_par?: number | null
  gir_pct?: number | null
  fairway_pct?: number | null
  avg_putts_per_hole?: number | null
  scramble_pct?: number | null
  three_putt_pct?: number | null
  scoring_distribution: ScoringDistribution
  hole_stats: CourseHoleStats[]
  rounds: CourseRoundStats[]
  sg_categories: Record<string, CourseSGCategory>
  avg_differential?: number | null
  best_differential?: number | null
  differentials: {
    round_id: number
    date: string
    differential: number
    score: number
    holes_played: number
    rating: number
    slope: number
  }[]
  excluded_rounds: number
}

export interface GolfClubSummary {
  id: number
  name: string
  address?: string | null
  photo_url?: string | null
  lat?: number | null
  lng?: number | null
  course_count: number
  total_rounds: number
  courses: {
    id: number
    name?: string | null
    holes?: number | null
    par?: number | null
    tee_count: number
    slope_min?: number | null
    slope_max?: number | null
    rounds_played: number
  }[]
}

export interface SearchCreateResult {
  status: string
  golf_club_id?: number
  course_id?: number
  club_name?: string
  address?: string
  photo_url?: string
  courses?: { id: number; name: string; holes: number }[]
  tees_synced?: number
  holes_populated?: number
  sync_result?: string
}

export interface PlaceCandidate {
  place_id: string
  name: string
  address?: string | null
  lat: number
  lng: number
  photo_url?: string | null
  distance_miles?: number | null
}

export interface PlaceCandidatesResponse {
  candidates: PlaceCandidate[]
}

export interface PlaceSuggestion {
  place_id: string
  name: string
  secondary_text?: string | null
}

export interface PlaceSuggestionsResponse {
  suggestions: PlaceSuggestion[]
}

// ============================================================
// Clubs (Equipment)
// ============================================================

export interface ClubDistanceStats {
  avg_yards?: number | null
  median_yards?: number | null
  std_dev?: number | null
  min_yards?: number | null
  max_yards?: number | null
  p10?: number | null
  p90?: number | null
  sample_count?: number | null
}

export interface ClubFullStats extends ClubDistanceStats {
  range_avg_yards?: number | null
  range_median_yards?: number | null
  range_std_dev?: number | null
  range_min_yards?: number | null
  range_max_yards?: number | null
  range_p10?: number | null
  range_p90?: number | null
  range_sample_count?: number | null
  combined_avg_yards?: number | null
  combined_median_yards?: number | null
  combined_std_dev?: number | null
  combined_min_yards?: number | null
  combined_max_yards?: number | null
  combined_p10?: number | null
  combined_p90?: number | null
  combined_sample_count?: number | null
}

export interface Club {
  id: number
  club_type: string
  name?: string | null
  model?: string | null
  shaft_length_in?: number | null
  flex?: string | null
  loft_deg?: number | null
  lie_deg?: number | null
  color?: string | null
  retired: boolean
  sort_order: number
  source: string
  garmin_id?: number | null
  stats?: ClubFullStats | null
  windowed_stats?: ClubDistanceStats | null
}

export interface ClubShot {
  id: string
  raw_id: number
  source: string
  date?: string | null
  shot_number: number
  carry_yards?: number | null
  total_yards?: number | null
  distance_yards?: number | null
  ball_speed_mph?: number | null
  club_speed_mph?: number | null
  smash_factor?: number | null
  launch_angle_deg?: number | null
  launch_direction_deg?: number | null
  attack_angle_deg?: number | null
  club_path_deg?: number | null
  face_angle_deg?: number | null
  face_to_path_deg?: number | null
  dynamic_loft_deg?: number | null
  spin_loft_deg?: number | null
  swing_plane_deg?: number | null
  swing_direction_deg?: number | null
  dynamic_lie_deg?: number | null
  landing_angle_deg?: number | null
  descent_angle_deg?: number | null
  spin_rate_rpm?: number | null
  spin_axis_deg?: number | null
  apex_yards?: number | null
  side_carry_yards?: number | null
  side_total_yards?: number | null
  curve_yards?: number | null
  hang_time_sec?: number | null
  impact_offset_in?: number | null
  impact_height_in?: number | null
  low_point_distance_in?: number | null
  shot_type?: string | null
  start_lie?: string | null
  end_lie?: string | null
  pin_distance_yards?: number | null
  fairway_side?: string | null
  fairway_side_yards?: number | null
  fairway_progress_yards?: number | null
  green_distance_yards?: number | null
  on_green?: boolean | null
  sg_pga?: number | null
  sg_personal?: number | null
  nearest_hazard_type?: string | null
  nearest_hazard_name?: string | null
  nearest_hazard_yards?: number | null
  round_id?: number | null
  hole_number?: number | null
  course_name?: string | null
  session_name?: string | null
}

export interface ClubDetail {
  club: Club
  shots: ClubShot[]
  source_counts: {
    garmin: number
    rapsodo: number
    trackman: number
  }
  avg_ball_speed?: number | null
  avg_club_speed?: number | null
  avg_smash_factor?: number | null
  avg_launch_angle?: number | null
  avg_attack_angle?: number | null
  avg_spin_rate?: number | null
  avg_club_path?: number | null
}

// ============================================================
// Stats
// ============================================================

export interface ScoringDistribution {
  birdie_or_better: number
  par: number
  bogey: number
  double: number
  triple_plus: number
}

export interface SGCategory {
  sg_pga_total: number
  sg_pga_per_round: number
  sg_pga_per_shot: number
  sg_personal_total: number
  sg_personal_per_round: number
  sg_personal_per_shot: number
  shot_count: number
  round_count: number
}

export interface SGPerRound {
  round_id: number
  date: string
  course_name?: string | null
  off_the_tee?: { sg_pga: number; sg_personal: number; shot_count: number } | null
  approach?: { sg_pga: number; sg_personal: number; shot_count: number } | null
  short_game?: { sg_pga: number; sg_personal: number; shot_count: number } | null
  putting?: { sg_pga: number; sg_personal: number; shot_count: number } | null
  total_sg_pga: number
  total_sg_personal: number
}

export interface SGSummary {
  overall: Record<string, SGCategory>
  per_round: SGPerRound[]
  round_count: number
  biggest_opportunity_pga?: string | null
  biggest_opportunity_personal?: string | null
}

export interface SGTrendPoint {
  round_id: number
  date: string
  course_name?: string | null
  off_the_tee?: number | null
  approach?: number | null
  short_game?: number | null
  putting?: number | null
  total?: number | null
  off_the_tee_personal?: number | null
  approach_personal?: number | null
  short_game_personal?: number | null
  putting_personal?: number | null
  total_personal?: number | null
}

export interface SGTrends {
  raw: SGTrendPoint[]
  rolling: Record<string, SGTrendPoint[]>
  best_rounds: Record<string, SGTrendPoint>
  worst_rounds: Record<string, SGTrendPoint>
}

export interface SGClubBreakdown {
  club_name: string
  category: string
  sg_pga_per_shot: number
  sg_pga_total: number
  sg_personal_per_shot?: number | null
  sg_personal_total?: number | null
  shot_count: number
}

export interface SGByClubResponse {
  clubs: SGClubBreakdown[]
  worst_club?: SGClubBreakdown | null
  best_club?: SGClubBreakdown | null
}

export interface ParBreakdown {
  par: number
  count: number
  avg_score: number
  avg_vs_par: number
  birdie_pct: number
  par_pct: number
  bogey_pct: number
  double_plus_pct: number
}

export interface ScoringRound {
  round_id: number
  date: string
  course_name: string
  holes_played: number
  score: number
  score_vs_par: number
  gir_pct?: number | null
  fw_pct?: number | null
  putts?: number | null
  putts_per_hole?: number | null
  three_putts: number
  birdie_or_better: number
  pars: number
  bogeys: number
  doubles: number
  triple_plus: number
}

export interface ScoringStats {
  gir_pct?: number | null
  fairway_pct?: number | null
  avg_putts_per_hole?: number | null
  putts_per_gir?: number | null
  scramble_pct?: number | null
  three_putt_pct?: number | null
  scoring_distribution: ScoringDistribution
  par_breakdown: ParBreakdown[]
  per_round: ScoringRound[]
}

export interface HandicapDifferential {
  round_ids: number[]
  date: string
  course_name: string
  score: number
  rating: number
  slope: number
  differential: number
  used: boolean
  is_combined: boolean
}

export interface HandicapTrendPoint {
  date: string
  handicap_index?: number | null
  differential: number
  differentials_available: number
}

// ============================================================
// Range Sessions
// ============================================================

export interface RangeSessionSummary {
  id: number
  source: string
  session_date: string
  title?: string | null
  shot_count: number
}

export interface RangeShotResponse {
  id: string
  raw_id: number
  session_id?: number | null
  shot_number: number
  club_type_raw: string
  club_name?: string | null
  club_color?: string | null
  club_brand?: string | null
  club_model?: string | null
  carry_yards?: number | null
  total_yards?: number | null
  ball_speed_mph?: number | null
  launch_angle_deg?: number | null
  launch_direction_deg?: number | null
  apex_yards?: number | null
  side_carry_yards?: number | null
  club_speed_mph?: number | null
  smash_factor?: number | null
  descent_angle_deg?: number | null
  attack_angle_deg?: number | null
  club_path_deg?: number | null
  spin_rate_rpm?: number | null
  spin_axis_deg?: number | null
  // Trackman-specific
  face_angle_deg?: number | null
  face_to_path_deg?: number | null
  dynamic_loft_deg?: number | null
  spin_loft_deg?: number | null
  swing_plane_deg?: number | null
  swing_direction_deg?: number | null
  dynamic_lie_deg?: number | null
  impact_offset_in?: number | null
  impact_height_in?: number | null
  low_point_distance_in?: number | null
  curve_yards?: number | null
  hang_time_sec?: number | null
  side_total_yards?: number | null
  smash_index?: number | null
  ball_speed_diff_mph?: number | null
  trajectory_json?: string | null
  source: string
}

export interface RangeClubGroupStats {
  club_type_raw: string
  club_name?: string | null
  avg_carry?: number | null
  avg_total?: number | null
  avg_ball_speed?: number | null
  avg_club_speed?: number | null
  avg_launch_angle?: number | null
  avg_spin_rate?: number | null
  shot_count: number
}

export interface RangeSessionDetail {
  id: number
  source: string
  session_date: string
  title?: string | null
  notes?: string | null
  shot_count: number
  club_groups: RangeClubGroupStats[]
  shots: RangeShotResponse[]
}

export interface RangeShotsResponse {
  sessions: RangeSessionSummary[]
  shots: RangeShotResponse[]
  clubs: string[]
}

export interface HandicapData {
  handicap_index?: number | null
  differentials_used: number
  differentials_available: number
  low_index?: number | null
  improvement_per_round?: number | null
  projections: {
    milestone: number
    rounds_away?: number | null
    label: string
  }[]
  trend: HandicapTrendPoint[]
  differentials: HandicapDifferential[]
}

export interface RangeTrendClub {
  club_type: string
  shot_count: number
  prior_shot_count: number
  avg_carry: number | null
  prior_avg_carry: number | null
  carry_delta: number | null
  side_std_dev: number | null
  prior_side_std_dev: number | null
  side_std_dev_delta: number | null
}

export interface RangeTrendsResponse {
  days: number
  recent_session_count: number
  clubs: RangeTrendClub[]
}

// ============================================================
// Practice Plans
// ============================================================

export interface RoundPlanAvailable {
  id: number
  name: string
  course_name: string
  planned_date?: string | null
  status: string
}

export interface PracticeActivity {
  id: number
  activity_order: number
  club?: string | null
  club_id?: number | null
  drill_id?: number | null
  drill_name?: string | null
  drill_description?: string | null
  ball_count?: number | null
  duration_minutes?: number | null
  focus_area: string
  sg_category?: string | null
  rationale?: string | null
  target_metric?: string | null
  notes?: string | null
  completed: boolean
}

export interface PracticeSession {
  id: number
  session_order: number
  session_type: string
  ball_count?: number | null
  duration_minutes?: number | null
  notes?: string | null
  activities: PracticeActivity[]
}

export interface PracticePlanSummary {
  id: number
  plan_type: string
  goal?: string | null
  status: string
  notes?: string | null
  focus_tags?: string[] | null
  round_plan_id?: number | null
  round_plan_info?: RoundPlanAvailable | null
  range_session_id?: number | null
  session_count: number
  total_activities: number
  completed_activities: number
  created_at?: string | null
  updated_at?: string | null
}

export interface PracticePlanDetail {
  id: number
  plan_type: string
  goal?: string | null
  status: string
  notes?: string | null
  focus_tags?: string[] | null
  round_plan_id?: number | null
  round_plan_info?: RoundPlanAvailable | null
  range_session_id?: number | null
  analysis?: AnalysisSummary | null
  created_at?: string | null
  updated_at?: string | null
  sessions: PracticeSession[]
}

// Analysis shapes from generate + snapshot
export interface SGCategoryAnalysis {
  category: string
  label: string
  sg_per_round: number
  sg_per_shot?: number
  recent_sg_per_round?: number
  trend?: string | null
  shot_count?: number
}

export interface RangeCourseGap {
  club_id: number
  club_name: string
  gap: number
  trend?: string | null
}

export interface MissHighlight {
  club: string
  dominant: string
  pct: number
  avg_miss_yards?: number
  sample?: number
}

export interface AnalysisSummary {
  sg_by_category?: SGCategoryAnalysis[]
  range_course_gaps?: RangeCourseGap[]
  miss_highlights?: MissHighlight[]
  worst_proximity_bucket?: { band: string; sg_per_shot: number } | null
  scoring_patterns?: {
    three_putt_rate?: number
    scramble_pct?: number
    penalties_per_round?: number
    bogey_plus_count?: number
    bogey_causes?: Record<string, number>
    total_holes?: number
    round_count?: number
  } | null
  player_context?: {
    mentioned_clubs?: string[]
    mentioned_skills?: string[]
    recent_struggles?: string[]
    has_notes?: boolean
  } | null
  course_needs?: {
    course_name?: string
    plan_name?: string
    club_frequency?: Record<string, number>
    distance_bands?: { band: string; count: number }[]
    total_holes?: number
  } | null
  focus_tags?: string[]
  total_rounds?: number
}

// Generate response
export interface GenerateSessionActivity {
  activity_order: number
  club?: string | null
  club_id?: number | null
  drill_id?: number | null
  drill_name?: string | null
  ball_count?: number | null
  duration_minutes?: number | null
  focus_area: string
  sg_category?: string | null
  rationale?: string | null
  target_metric?: string | null
  notes?: string | null
}

export interface GenerateSession {
  session_order: number
  session_type: string
  ball_count?: number | null
  duration_minutes?: number | null
  activities: GenerateSessionActivity[]
}

export interface GeneratePlanResponse {
  analysis: AnalysisSummary
  sessions: GenerateSession[]
}

// Save/update request types
export interface SessionSpecInput {
  session_type: string
  ball_count?: number | null
  duration_minutes?: number | null
}

export interface SaveActivityInput {
  activity_order: number
  club?: string | null
  club_id?: number | null
  drill_id?: number | null
  ball_count?: number | null
  duration_minutes?: number | null
  focus_area: string
  sg_category?: string | null
  rationale?: string | null
  target_metric?: string | null
  notes?: string | null
}

export interface SaveSessionInput {
  session_order: number
  session_type: string
  ball_count?: number | null
  duration_minutes?: number | null
  notes?: string | null
  activities: SaveActivityInput[]
}

export interface SavePlanRequest {
  plan_type: string
  round_plan_id?: number | null
  goal?: string | null
  focus_tags?: string[] | null
  notes?: string | null
  analysis_snapshot?: string | null
  range_session_id?: number | null
  sessions: SaveSessionInput[]
}

export interface GeneratePlanRequest {
  plan_type: string
  round_plan_id?: number | null
  goal?: string | null
  focus_tags?: string[] | null
  sessions: SessionSpecInput[]
}

// Plan review (completed plans)
export interface PlanReviewClubStats {
  shot_count: number
  avg_carry?: number
  std_carry?: number
  avg_lateral?: number
  lateral_std?: number
  avg_ball_speed?: number
}

export interface PlanReviewResponse {
  plan_id: number
  status: string
  created_at?: string | null
  before: AnalysisSummary
  deltas: {
    sg_categories?: { category: string; label: string; before: number }[]
    scoring?: { three_putt_before?: number | null; three_putt_after?: number | null }
    range_session?: {
      session_date?: string | null
      title?: string | null
      shot_count: number
      clubs: Record<string, PlanReviewClubStats>
    }
    miss_direction?: {
      club: string
      before_pct: number
      before_side: string
      after_pct?: number | null
      after_dominant?: string | null
    }[]
    gaps?: {
      club: string
      before_gap: number
      after_gap: number
      trend: string
    }[]
  }
}

// Drills
export interface DrillSummary {
  id: number
  name: string
  description: string
  target?: string | null
  sg_category?: string | null
  focus_area?: string | null
  club_type?: string | null
  session_types?: string[] | null
  is_default: boolean
}

// ============================================================
// OCR
// ============================================================

export interface OcrCell {
  text: string
  conf: number
}

export interface OcrResult {
  rows: OcrCell[][]
}

// ============================================================
// Trackman Sync
// ============================================================

export interface TrackmanSyncSession {
  id: string
  range_id?: string | null
  kind: string
  time: string
  display_type: string
  facility?: string | null
  shot_count?: number | null
  already_imported: boolean
}

export interface TrackmanSyncSessionsResponse {
  sessions: TrackmanSyncSession[]
  page: number
  page_count: number
  total: number
}

export interface TrackmanSyncImportRequest {
  token: string
  activity_id: string
  range_id?: string
  kind: string
  activity_time?: string
}

export interface MergeSuggestionCandidate {
  id: number
  club_type: string
  model?: string | null
  source: string
}

export interface MergeSuggestion {
  new_club_id: number
  club_type: string
  new_club_source: string
  candidates: MergeSuggestionCandidate[]
}

export interface TrackmanSyncImportResult {
  status: string
  session_id?: number
  shot_count?: number
  clubs?: string[]
  message?: string
  merge_suggestions?: MergeSuggestion[]
}
