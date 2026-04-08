import { useQuery } from '@tanstack/react-query'
import { get } from '../../api'
import type { RoundSummary, RoundDetail } from '../../api'

/** Fetch all rounds, filtered client-side by courseId */
export function useCourseRounds(courseId: number | undefined) {
  return useQuery({
    queryKey: ['rounds', { limit: 500 }],
    queryFn: () => get<RoundSummary[]>('/rounds/?limit=500'),
    select: (data) => courseId ? data.filter((r) => r.course_id === courseId).sort((a, b) => b.date.localeCompare(a.date)) : [],
    enabled: courseId !== undefined,
    staleTime: 5 * 60 * 1000,
  })
}

/** Fetch a single round detail (cached) */
export function useCourseRoundDetail(roundId: number | undefined) {
  return useQuery({
    queryKey: ['rounds', roundId],
    queryFn: () => get<RoundDetail>(`/rounds/${roundId}`),
    enabled: roundId !== undefined,
    staleTime: 10 * 60 * 1000,
  })
}
