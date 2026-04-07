import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, del } from '../client'
import type { RangeSessionSummary, RangeShotsResponse } from '../types'

export function useRangeSessions() {
  return useQuery({
    queryKey: ['range', 'sessions'],
    queryFn: () => get<RangeSessionSummary[]>('/range/sessions'),
  })
}

export function useRangeShots(sessionId: string) {
  return useQuery({
    queryKey: ['range', 'shots', sessionId],
    queryFn: () => get<RangeShotsResponse>(`/range/shots?session_id=${sessionId}`),
    staleTime: 2 * 60 * 1000,
  })
}

export function useDeleteRangeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: number) => del<{ status: string }>(`/range/sessions/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['range'] })
    },
  })
}
