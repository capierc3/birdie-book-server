import { useQuery } from '@tanstack/react-query'
import { get } from '../../api'

/** Strategy data returned by /api/courses/{id}/strategy */
export interface PlayerClub {
  club_type: string
  avg_yards: number
  std_dev?: number | null
  p10?: number | null
  p90?: number | null
  sample_count?: number | null
  color?: string | null
}

export interface MissTendency {
  left_pct: number
  right_pct: number
  center_pct: number
  total_shots: number
}

export interface LateralDispersion {
  lateral_std_dev?: number | null
  lateral_mean?: number | null
}

export interface SGCategoryData {
  avg_sg_pga: number
  shot_count: number
}

export interface PlayerStrategy {
  clubs: PlayerClub[]
  scoring?: Record<string, number> | null
  miss_tendencies?: Record<string, MissTendency> | null
  lateral_dispersion?: Record<string, LateralDispersion> | null
  sg_categories?: Record<string, SGCategoryData> | null
}

export interface CourseStrategyData {
  player: PlayerStrategy
}

export function useCourseStrategy(courseId: number | undefined) {
  return useQuery({
    queryKey: ['courses', courseId, 'strategy'],
    queryFn: () => get<CourseStrategyData>(`/courses/${courseId}/strategy`),
    enabled: courseId !== undefined,
    staleTime: 5 * 60 * 1000,
  })
}
