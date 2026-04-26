import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, patch } from '../client'

export interface CurrentUser {
  id: number
  name: string
  email: string | null
  trackman_user_id: string | null
  is_app_user: boolean
}

export interface CurrentUserUpdate {
  name?: string
  email?: string | null
  trackman_user_id?: string | null
}

export interface PartnerSummary {
  id: number
  name: string
  times_played_with: number
  last_played: string | null
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => get<CurrentUser>('/me'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateMe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CurrentUserUpdate) => patch<CurrentUser>('/me', body),
    onSuccess: (data) => {
      qc.setQueryData(['me'], data)
    },
  })
}

export function usePartners(limit = 100) {
  return useQuery({
    // Bumped key from ['partners', limit] → ['partners', 'v2', limit] to bust
    // any persisted IndexedDB cache from before the LEFT JOIN change.
    queryKey: ['partners', 'v2', limit],
    queryFn: () => get<PartnerSummary[]>(`/players/partners?limit=${limit}`),
    // Always refetch on mount — partner data is small and changes between
    // sessions, so don't trust a stale persisted entry without a server check.
    refetchOnMount: 'always',
  })
}
