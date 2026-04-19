import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, del } from '../client'
import type { Course, CourseDetail, CourseStats, GolfClubSummary, SearchCreateResult } from '../types'

export interface ClubDeletePreview {
  club_id: number
  club_name: string | null
  course_count: number
  round_count: number
}

export interface CourseDeletePreview {
  course_id: number
  course_name: string | null
  round_count: number
}

export interface DeleteResult {
  status: string
  round_count?: number
  course_count?: number
  club_id?: number
  course_id?: number
}

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => get<Course[]>('/courses/'),
  })
}

export function useCourse(courseId: number | undefined) {
  return useQuery({
    queryKey: ['courses', courseId],
    queryFn: () => get<CourseDetail>(`/courses/${courseId}`),
    enabled: courseId !== undefined,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCourseStats(courseId: number | undefined) {
  return useQuery({
    queryKey: ['courses', courseId, 'stats'],
    queryFn: () => get<CourseStats>(`/courses/${courseId}/stats`),
    enabled: courseId !== undefined,
    staleTime: 10 * 60 * 1000,
  })
}

export function useGolfClubs() {
  return useQuery({
    queryKey: ['golf-clubs'],
    queryFn: () => get<GolfClubSummary[]>('/courses/clubs'),
  })
}

export interface SearchCreateArgs {
  name: string
  google_place_id?: string
}

export function useSearchCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: SearchCreateArgs | string) => {
      const body = typeof args === 'string' ? { name: args } : args
      return post<SearchCreateResult>('/courses/search-create', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}

export function useClubDeletePreview(clubId: number | undefined) {
  return useQuery({
    queryKey: ['golf-clubs', clubId, 'delete-preview'],
    queryFn: () => get<ClubDeletePreview>(`/courses/club/${clubId}/delete-preview`),
    enabled: clubId !== undefined,
    staleTime: 0,
  })
}

export function useCourseDeletePreview(courseId: number | undefined) {
  return useQuery({
    queryKey: ['courses', courseId, 'delete-preview'],
    queryFn: () => get<CourseDeletePreview>(`/courses/${courseId}/delete-preview`),
    enabled: courseId !== undefined,
    staleTime: 0,
  })
}

export function useDeleteClub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clubId: number) => del<DeleteResult>(`/courses/club/${clubId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}

export function useDeleteCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courseId: number) => del<DeleteResult>(`/courses/${courseId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
      qc.invalidateQueries({ queryKey: ['rounds'] })
    },
  })
}
