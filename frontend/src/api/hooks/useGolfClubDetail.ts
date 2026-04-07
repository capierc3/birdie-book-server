import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del, patch, postForm, ApiError } from '../client'

// ── Queries ──

export function useClubPhotos(clubId: number | undefined) {
  return useQuery({
    queryKey: ['club-photos', clubId],
    queryFn: () => get<{ photos: { index: number; resource: string }[]; count: number }>(
      `/courses/club/${clubId}/photos`,
    ),
    enabled: clubId !== undefined,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCourseMergePreview(targetId: number | undefined, sourceId: number | undefined) {
  return useQuery({
    queryKey: ['merge-preview', targetId, sourceId],
    queryFn: () => get<MergePreview>(`/courses/${targetId}/merge-preview/${sourceId}`),
    enabled: targetId !== undefined && sourceId !== undefined,
    staleTime: 0,
  })
}

// ── Mutations ──

export function useUpdateTee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, teeId, body }: {
      courseId: number; teeId: number; body: TeeUpdateBody
    }) => put<{ status: string; tee_id: number }>(`/courses/${courseId}/tees/${teeId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

export function useDeleteTee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, teeId }: { courseId: number; teeId: number }) =>
      del<{ status: string }>(`/courses/${courseId}/tees/${teeId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}

export function useReassignTeeRounds() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, teeId, assignments }: {
      courseId: number; teeId: number; assignments: Record<number, number>
    }) => post<{ status: string; reassigned: number }>(
      `/courses/${courseId}/tees/${teeId}/reassign-rounds`,
      { assignments },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}

export function useMergeCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ targetId, sourceId, resolveHoles, resolvePar }: {
      targetId: number; sourceId: number; resolveHoles?: number; resolvePar?: number
    }) => {
      const params = new URLSearchParams()
      if (resolveHoles !== undefined) params.set('resolve_holes', String(resolveHoles))
      if (resolvePar !== undefined) params.set('resolve_par', String(resolvePar))
      const qs = params.toString()
      return post<{ status: string; rounds_moved: number; tees_moved: number }>(
        `/courses/${targetId}/merge/${sourceId}${qs ? `?${qs}` : ''}`,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}

export function useSyncClubCourses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clubId: number) =>
      post<{ status: string; details: unknown[] }>(`/courses/club/${clubId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

export function useOsmSearch() {
  return useMutation({
    mutationFn: (body: { query: string; near_lat?: number; near_lng?: number }) =>
      post<OsmSearchResult[]>('/courses/osm/search', body),
  })
}

export function useOsmLinkClub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clubId, osmId, osmType }: {
      clubId: number; osmId: number; osmType?: string
    }) => post<Record<string, unknown>>(
      `/courses/club/${clubId}/osm/link`,
      { osm_id: osmId, osm_type: osmType ?? 'relation', import_features: true },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

export function useOsmLinkCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ courseId, osmId, osmType }: {
      courseId: number; osmId: number; osmType?: string
    }) => post<Record<string, unknown>>(
      `/courses/${courseId}/osm/link`,
      { osm_id: osmId, osm_type: osmType ?? 'relation', import_features: true },
    ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses', vars.courseId] })
    },
  })
}

export function useSetPhotoFromPlaces() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clubId, photoResource }: { clubId: number; photoResource: string }) =>
      post<{ status: string; photo_url: string }>(
        `/courses/club/${clubId}/set-photo-places`,
        { photo_resource: photoResource },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['club-photos'] })
    },
  })
}

export function useSetPhotoUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clubId, file }: { clubId: number; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return postForm<{ status: string; photo_url: string }>(
        `/courses/club/${clubId}/set-photo-upload`,
        fd,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['club-photos'] })
    },
  })
}

export function useUpdateRoundTee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId, teeId }: { roundId: number; teeId: number }) =>
      patch<unknown>(`/rounds/${roundId}`, { tee_id: teeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}

// ── Types ──

export interface TeeUpdateBody {
  tee_name?: string
  par_total?: number | null
  total_yards?: number | null
  course_rating?: number | null
  slope_rating?: number | null
}

export interface MergePreview {
  target_id: number
  source_id: number
  target_name: string
  source_name: string
  conflicts: MergeConflict[]
  rounds_to_move: number
  tees_to_move: number
}

export interface MergeConflict {
  field: string
  label: string
  target_value: number
  source_value: number
}

export interface OsmSearchResult {
  osm_id: number
  osm_type: string
  name: string
  display_name: string
  lat: number
  lng: number
  distance_miles?: number
}

export interface TeeDeleteConflict {
  message: string
  rounds: { id: number; date: string; total_strokes: number | null }[]
  available_tees: { id: number; tee_name: string }[]
}

export { ApiError }
