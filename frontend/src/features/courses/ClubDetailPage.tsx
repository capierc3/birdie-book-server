import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { StatCard, EmptyState } from '../../components'
import { useGolfClubs, get } from '../../api'
import type { GolfClubSummary, CourseDetail } from '../../api'
import { ClubHeroBanner } from './ClubHeroBanner'
import { ClubRoundsSection } from './ClubRoundsSection'
import { ClubCoursesSection } from './ClubCoursesSection'
import { ClubActionsSection } from './ClubActionsSection'
import { ClubOsmSection } from './ClubOsmSection'
import { PhotoPickerModal } from './PhotoPickerModal'
import styles from '../../styles/pages.module.css'

export function ClubDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clubId = id ? Number(id) : undefined

  const { data: clubs = [], isLoading: clubsLoading } = useGolfClubs()
  const [photoOpen, setPhotoOpen] = useState(false)

  const club: GolfClubSummary | undefined = useMemo(
    () => clubs.find((c) => c.id === clubId),
    [clubs, clubId],
  )

  // Fetch full CourseDetail for each course at this club
  const courseQueries = useQueries({
    queries: (club?.courses ?? []).map((c) => ({
      queryKey: ['courses', c.id],
      queryFn: () => get<CourseDetail>(`/courses/${c.id}`),
      staleTime: 2 * 60 * 1000,
    })),
  })

  const courseDetails = useMemo(
    () => courseQueries
      .filter((q) => q.data != null)
      .map((q) => q.data!),
    [courseQueries],
  )

  const coursesLoading = courseQueries.some((q) => q.isLoading)
  const courseIds = useMemo(() => (club?.courses ?? []).map((c) => c.id), [club])

  // Stats
  const totalTees = useMemo(
    () => (club?.courses ?? []).reduce((sum, c) => sum + c.tee_count, 0),
    [club],
  )

  const slopeRange = useMemo(() => {
    const slopes = (club?.courses ?? []).flatMap((c) => [c.slope_min, c.slope_max].filter((v): v is number => v != null))
    if (slopes.length === 0) return '--'
    const min = Math.min(...slopes)
    const max = Math.max(...slopes)
    return min === max ? String(min) : `${min}\u2013${max}`
  }, [club])

  if (clubsLoading) {
    return <div className={styles.loading}>Loading club...</div>
  }

  if (!club) {
    return <EmptyState message="Club not found" description="This club may have been deleted or merged." />
  }

  return (
    <div>
      <ClubHeroBanner
        club={club}
        onBack={() => navigate('/courses')}
        onChangePhoto={() => setPhotoOpen(true)}
      />

      <div className={styles.statsRow}>
        <StatCard label="Courses" value={club.course_count} />
        <StatCard label="Tee Sets" value={totalTees} />
        <StatCard label="Slope Range" value={slopeRange} />
      </div>

      <div className={styles.section}>
        <ClubRoundsSection courseIds={courseIds} courseDetails={courseDetails} />
      </div>

      {coursesLoading ? (
        <div className={styles.loading}>Loading courses...</div>
      ) : (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Courses at This Club</h2>
          <ClubCoursesSection courseDetails={courseDetails} />
        </div>
      )}

      <ClubActionsSection clubId={club.id} />

      <div className={styles.section}>
        <ClubOsmSection club={club} courseDetails={courseDetails} />
      </div>

      <PhotoPickerModal
        isOpen={photoOpen}
        onClose={() => setPhotoOpen(false)}
        clubId={club.id}
      />
    </div>
  )
}
