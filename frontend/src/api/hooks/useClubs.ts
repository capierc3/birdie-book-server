import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { Club, ClubDetail } from '../types'

export function useClubs(windowDays?: number) {
  const params = windowDays ? `?window_days=${windowDays}` : ''
  return useQuery({
    queryKey: ['clubs', { windowDays }],
    queryFn: () => get<Club[]>(`/clubs/${params}`),
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
