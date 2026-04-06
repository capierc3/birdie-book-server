import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { RoundSummary, RoundDetail } from '../types'

export function useRounds(limit = 100) {
  return useQuery({
    queryKey: ['rounds', { limit }],
    queryFn: () => get<RoundSummary[]>(`/rounds/?limit=${limit}`),
  })
}

export function useRound(roundId: number | undefined) {
  return useQuery({
    queryKey: ['rounds', roundId],
    queryFn: () => get<RoundDetail>(`/rounds/${roundId}`),
    enabled: roundId !== undefined,
    staleTime: 2 * 60 * 1000,
  })
}
