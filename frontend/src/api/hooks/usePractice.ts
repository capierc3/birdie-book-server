import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, patch, del } from '../client'
import type {
  PracticePlanSummary,
  PracticePlanDetail,
  PlanReviewResponse,
  RoundPlanAvailable,
  GeneratePlanResponse,
  GeneratePlanRequest,
  SavePlanRequest,
  DrillSummary,
} from '../types'

export function usePracticePlans(filters?: {
  status?: string
  plan_type?: string
}) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.plan_type) params.set('plan_type', filters.plan_type)
  const qs = params.toString()
  return useQuery({
    queryKey: ['practice', 'plans', filters],
    queryFn: () =>
      get<PracticePlanSummary[]>(`/practice/plans${qs ? `?${qs}` : ''}`),
  })
}

export function usePracticePlan(id: number | undefined) {
  return useQuery({
    queryKey: ['practice', 'plans', id],
    queryFn: () => get<PracticePlanDetail>(`/practice/plans/${id}`),
    enabled: id !== undefined,
    staleTime: 2 * 60 * 1000,
  })
}

export function usePlanReview(id: number | undefined, enabled = false) {
  return useQuery({
    queryKey: ['practice', 'plans', id, 'review'],
    queryFn: () => get<PlanReviewResponse>(`/practice/plans/${id}/review`),
    enabled: enabled && id !== undefined,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRoundPlansAvailable() {
  return useQuery({
    queryKey: ['practice', 'round-plans-available'],
    queryFn: () => get<RoundPlanAvailable[]>('/practice/round-plans-available'),
    staleTime: 5 * 60 * 1000,
  })
}

export function useGeneratePlan() {
  return useMutation({
    mutationFn: (req: GeneratePlanRequest) =>
      post<GeneratePlanResponse>('/practice/generate', req),
  })
}

export function useSavePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: SavePlanRequest) =>
      post<PracticePlanDetail>('/practice/plans', req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['practice', 'plans'] })
    },
  })
}

export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      planId,
      ...body
    }: {
      planId: number
      goal?: string | null
      notes?: string | null
      status?: string | null
      focus_tags?: string[] | null
      range_session_id?: number | null
    }) => put<PracticePlanDetail>(`/practice/plans/${planId}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['practice', 'plans', vars.planId] })
      qc.invalidateQueries({ queryKey: ['practice', 'plans'] })
    },
  })
}

export function useDeletePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planId: number) =>
      del<{ status: string }>(`/practice/plans/${planId}`),
    onSuccess: (_data, planId) => {
      qc.removeQueries({ queryKey: ['practice', 'plans', planId], exact: true })
      void qc.invalidateQueries({ queryKey: ['practice', 'plans'] })
    },
  })
}

export function useToggleActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, activityId }: { planId: number; activityId: number }) =>
      patch<{ completed: boolean }>(
        `/practice/plans/${planId}/activities/${activityId}`,
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['practice', 'plans', vars.planId] })
      qc.invalidateQueries({ queryKey: ['practice', 'plans'] })
    },
  })
}

export function useUpdateActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      planId,
      activityId,
      ...body
    }: {
      planId: number
      activityId: number
      club?: string | null
      club_id?: number | null
      drill_id?: number | null
      ball_count?: number | null
      duration_minutes?: number | null
      focus_area?: string
      target_metric?: string | null
      notes?: string | null
      rationale?: string | null
    }) => put(`/practice/plans/${planId}/activities/${activityId}`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['practice', 'plans', vars.planId] })
    },
  })
}

export function useAddActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      planId,
      sessionId,
      ...body
    }: {
      planId: number
      sessionId: number
      club?: string | null
      club_id?: number | null
      drill_id?: number | null
      ball_count?: number | null
      duration_minutes?: number | null
      focus_area?: string
      sg_category?: string | null
      rationale?: string | null
      target_metric?: string | null
      notes?: string | null
    }) =>
      post(`/practice/plans/${planId}/sessions/${sessionId}/activities`, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['practice', 'plans', vars.planId] })
    },
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, activityId }: { planId: number; activityId: number }) =>
      del(`/practice/plans/${planId}/activities/${activityId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['practice', 'plans', vars.planId] })
      qc.invalidateQueries({ queryKey: ['practice', 'plans'] })
    },
  })
}

export function useDrills(filters?: { session_type?: string }) {
  const params = new URLSearchParams()
  if (filters?.session_type) params.set('session_type', filters.session_type)
  const qs = params.toString()
  return useQuery({
    queryKey: ['drills', filters],
    queryFn: () => get<DrillSummary[]>(`/drills${qs ? `?${qs}` : ''}`),
    enabled: !!filters?.session_type,
    staleTime: 10 * 60 * 1000,
  })
}
