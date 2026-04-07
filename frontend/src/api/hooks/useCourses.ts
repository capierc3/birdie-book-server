import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post } from '../client'
import type { Course, CourseDetail, CourseStats, GolfClubSummary, SearchCreateResult } from '../types'

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

export function useSearchCreateCourse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => post<SearchCreateResult>('/courses/search-create', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['golf-clubs'] })
      qc.invalidateQueries({ queryKey: ['courses'] })
    },
  })
}
