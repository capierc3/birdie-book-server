import { useQuery } from '@tanstack/react-query'
import { get } from '../client'
import type { Course, CourseDetail, CourseStats, GolfClubSummary } from '../types'

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
