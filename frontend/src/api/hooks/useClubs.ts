import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { Club, ClubDetail } from '../types'

export function useClubs(windowType?: string, windowValue?: number) {
  const params = new URLSearchParams()
  if (windowType && windowValue != null) {
    params.set('window_type', windowType)
    params.set('window_value', String(windowValue))
  }
  const qs = params.toString()
  return useQuery({
    queryKey: ['clubs', { windowType, windowValue }],
    queryFn: () => get<Club[]>(`/clubs/${qs ? `?${qs}` : ''}`),
  })
}

export function useClubDetail(clubId: number | undefined) {
  return useQuery({
    queryKey: ['clubs', clubId, 'detail'],
    queryFn: () => get<ClubDetail>(`/clubs/${clubId}/shots`),
    enabled: clubId !== undefined,
    staleTime: 2 * 60 * 1000,
  })
}
