import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, del, postForm } from '../client'
import type {
  RangeSessionSummary,
  RangeShotsResponse,
  OcrResult,
  TrackmanSyncSessionsResponse,
  TrackmanSyncImportRequest,
  TrackmanSyncImportResult,
} from '../types'

export function useRangeSessions() {
  return useQuery({
    queryKey: ['range', 'sessions'],
    queryFn: () => get<RangeSessionSummary[]>('/range/sessions'),
  })
}

export function useRangeShots(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: ['range', 'shots', sessionId],
    queryFn: () => get<RangeShotsResponse>(`/range/shots?session_id=${sessionId}`),
    staleTime: 2 * 60 * 1000,
    enabled,
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

interface CsvImportBody {
  csv_text: string
  title?: string
  session_date?: string
  notes?: string
}

interface ImportResult {
  status: string
  session_id: number
  shot_count: number
}

export function useImportCsvText() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CsvImportBody) => post<ImportResult>('/range/import/csv', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['range'] })
      qc.invalidateQueries({ queryKey: ['clubs'] })
    },
  })
}

export function useImportCsvFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, title, sessionDate, notes }: { file: File; title?: string; sessionDate?: string; notes?: string }) => {
      const form = new FormData()
      form.append('file', file)
      const params = new URLSearchParams()
      if (title) params.set('title', title)
      if (sessionDate) params.set('session_date', sessionDate)
      if (notes) params.set('notes', notes)
      const qs = params.toString()
      return postForm<ImportResult>(`/range/import/csv-file${qs ? `?${qs}` : ''}`, form)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['range'] })
      qc.invalidateQueries({ queryKey: ['clubs'] })
    },
  })
}

interface ManualShotInput {
  club: string
  carry_yards?: number | null
  total_yards?: number | null
  ball_speed_mph?: number | null
  height_ft?: number | null
  launch_angle_deg?: number | null
  launch_direction_deg?: number | null
  carry_side_ft?: number | null
  from_pin_yds?: number | null
  spin_rate_rpm?: number | null
  club_speed_mph?: number | null
  smash_factor?: number | null
  attack_angle_deg?: number | null
  club_path_deg?: number | null
  spin_axis_deg?: number | null
}

interface ManualSessionBody {
  title?: string
  session_date?: string
  notes?: string
  shots: ManualShotInput[]
}

export function useCreateManualSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ManualSessionBody) =>
      post<{ status: string; session_id: number; shot_count: number }>('/range/sessions/manual', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['range'] })
      qc.invalidateQueries({ queryKey: ['clubs'] })
    },
  })
}

export function useOcrExtract() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return postForm<OcrResult>('/range/import/ocr', fd)
    },
  })
}

// ── Trackman Sync ──

export function useTrackmanSyncSessions(token: string, page: number) {
  return useQuery({
    queryKey: ['trackman-sync', 'sessions', token, page],
    queryFn: () =>
      get<TrackmanSyncSessionsResponse>(
        `/range/import/trackman-sync/sessions?token=${encodeURIComponent(token)}&page=${page}`,
      ),
    enabled: !!token,
    staleTime: 30_000,
    retry: false,
  })
}

export function useTrackmanSyncImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TrackmanSyncImportRequest) =>
      post<TrackmanSyncImportResult>(
        '/range/import/trackman-sync',
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['range'] })
      qc.invalidateQueries({ queryKey: ['clubs'] })
      qc.invalidateQueries({ queryKey: ['trackman-sync'] })
    },
  })
}
