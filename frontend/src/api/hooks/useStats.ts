import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { SGSummary, SGTrends, SGByClubResponse, ScoringStats, HandicapData } from '../types'

const STATS_STALE_TIME = 10 * 60 * 1000 // 10 minutes

export function useSGSummary() {
  return useQuery({
    queryKey: ['stats', 'strokes-gained'],
    queryFn: () => get<SGSummary>('/stats/strokes-gained'),
    staleTime: STATS_STALE_TIME,
  })
}

export function useSGTrends() {
  return useQuery({
    queryKey: ['stats', 'strokes-gained', 'trends'],
    queryFn: () => get<SGTrends>('/stats/strokes-gained/trends'),
    staleTime: STATS_STALE_TIME,
  })
}

export function useSGByClub() {
  return useQuery({
    queryKey: ['stats', 'strokes-gained', 'by-club'],
    queryFn: () => get<SGByClubResponse>('/stats/strokes-gained/by-club'),
    staleTime: STATS_STALE_TIME,
  })
}

export function useScoring() {
  return useQuery({
    queryKey: ['stats', 'scoring'],
    queryFn: () => get<ScoringStats>('/stats/scoring'),
    staleTime: STATS_STALE_TIME,
  })
}

export function useHandicap() {
  return useQuery({
    queryKey: ['stats', 'handicap'],
    queryFn: () => get<HandicapData>('/stats/handicap'),
    staleTime: STATS_STALE_TIME,
  })
}
