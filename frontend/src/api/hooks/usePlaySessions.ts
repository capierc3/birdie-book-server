import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, patch, del } from '../client'
import type {
  PlaySessionSummary,
  PlaySessionDetail,
  PlaySessionCreate,
  PlaySessionUpdate,
  PlaySessionPartner,
  PlaySessionPartnerInput,
  PlaySessionWeatherSample,
} from '../types'

const BASE = '/play-sessions'

export function usePlaySessions(params?: { state?: string; courseId?: number; unlinked?: boolean }) {
  const qs = new URLSearchParams()
  if (params?.state) qs.set('state', params.state)
  if (params?.courseId != null) qs.set('course_id', String(params.courseId))
  if (params?.unlinked != null) qs.set('unlinked', String(params.unlinked))
  const q = qs.toString()
  return useQuery({
    queryKey: ['play-sessions', params ?? {}],
    queryFn: () => get<PlaySessionSummary[]>(`${BASE}/${q ? `?${q}` : ''}`),
  })
}

export function usePlaySession(id: number | undefined) {
  return useQuery({
    queryKey: ['play-sessions', id],
    queryFn: () => get<PlaySessionDetail>(`${BASE}/${id}`),
    enabled: id !== undefined,
  })
}

export function useCreatePlaySession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PlaySessionCreate) => post<PlaySessionDetail>(`${BASE}/`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['play-sessions'] })
    },
  })
}

export function useUpdatePlaySession(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PlaySessionUpdate) => patch<PlaySessionDetail>(`${BASE}/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(['play-sessions', id], data)
      qc.invalidateQueries({ queryKey: ['play-sessions'] })
    },
  })
}

export function useDeletePlaySession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => del<{ status: string; session_id: number }>(`${BASE}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['play-sessions'] })
    },
  })
}

export function useAddPartner(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: PlaySessionPartnerInput) =>
      post<PlaySessionPartner>(`${BASE}/${sessionId}/partners`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['play-sessions', sessionId] })
    },
  })
}

export function useDeletePartner(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (partnerId: number) =>
      del<{ status: string }>(`${BASE}/${sessionId}/partners/${partnerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['play-sessions', sessionId] })
    },
  })
}

export function useSampleWeather(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (opts?: { hole_number?: number; lat?: number; lng?: number }) => {
      const qs = new URLSearchParams()
      if (opts?.hole_number != null) qs.set('hole_number', String(opts.hole_number))
      if (opts?.lat != null) qs.set('lat', String(opts.lat))
      if (opts?.lng != null) qs.set('lng', String(opts.lng))
      const query = qs.toString()
      return post<PlaySessionWeatherSample>(
        `${BASE}/${sessionId}/weather/sample${query ? `?${query}` : ''}`,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['play-sessions', sessionId] })
    },
  })
}

export function useLinkGarminRound(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (roundId: number) =>
      post<PlaySessionDetail>(`${BASE}/${sessionId}/link/${roundId}`),
    onSuccess: (data) => {
      qc.setQueryData(['play-sessions', sessionId], data)
      qc.invalidateQueries({ queryKey: ['play-sessions'] })
    },
  })
}

export function useUnlinkGarminRound(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => del<PlaySessionDetail>(`${BASE}/${sessionId}/link`),
    onSuccess: (data) => {
      qc.setQueryData(['play-sessions', sessionId], data)
      qc.invalidateQueries({ queryKey: ['play-sessions'] })
    },
  })
}
