import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Card, CardHeader, DataTable, Badge, Button, useConfirm } from '../../components'
import type { Column } from '../../components'
import { useDeleteTee, ApiError } from '../../api'
import type { CourseDetail, CourseTee, TeeDeleteConflict } from '../../api'
import { TeeEditModal } from './TeeEditModal'
import { TeeReassignModal } from './TeeReassignModal'
import { CourseMergeModal } from './CourseMergeModal'
import cs from './ClubDetailPage.module.css'

interface Props {
  courseDetails: CourseDetail[]
}

export function ClubCoursesSection({ courseDetails }: Props) {
  const navigate = useNavigate()
  const deleteTee = useDeleteTee()
  const { confirm, alert } = useConfirm()

  // Tee edit state
  const [editTee, setEditTee] = useState<{ tee: CourseTee; courseId: number } | null>(null)

  // Tee reassign state
  const [reassignState, setReassignState] = useState<{
    courseId: number; teeId: number; conflict: TeeDeleteConflict
  } | null>(null)

  // Merge state
  const [mergeSource, setMergeSource] = useState<{ id: number; name?: string | null } | null>(null)
  const [mergeTargets, setMergeTargets] = useState<{ id: number; name?: string | null }[]>([])

  const handleDeleteTee = async (courseId: number, teeId: number) => {
    const ok = await confirm({
      title: 'Delete Tee',
      message: 'Delete this tee and all its hole data?',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    try {
      await deleteTee.mutateAsync({ courseId, teeId })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const parsed = JSON.parse(e.message)
          const detail = (parsed.detail ?? parsed) as TeeDeleteConflict
          setReassignState({ courseId, teeId, conflict: detail })
        } catch {
          await alert('This tee has linked rounds. Please reassign them first.')
        }
      } else {
        await alert(e instanceof Error ? e.message : 'Failed to delete tee', 'Error')
      }
    }
  }

  const handleMergeOpen = (sourceId: number) => {
    const source = courseDetails.find((c) => c.id === sourceId)
    const others = courseDetails.filter((c) => c.id !== sourceId)
    setMergeSource({ id: sourceId, name: source?.course_name ?? source?.display_name })
    setMergeTargets(others.map((c) => ({ id: c.id, name: c.course_name ?? c.display_name })))
  }

  const teeColumns = (courseId: number): Column<CourseTee>[] => [
    {
      key: 'tee_name',
      header: 'Tee',
      render: (t) => t.tee_name ?? '--',
    },
    {
      key: 'par_total',
      header: 'Par',
      align: 'center',
      render: (t) => t.par_total ?? '--',
    },
    {
      key: 'total_yards',
      header: 'Yards',
      align: 'center',
      render: (t) => t.total_yards != null ? t.total_yards.toLocaleString() : '--',
    },
    {
      key: 'course_rating',
      header: 'Rating',
      align: 'center',
      render: (t) => t.course_rating ?? '--',
    },
    {
      key: 'slope_rating',
      header: 'Slope',
      align: 'center',
      render: (t) => t.slope_rating ?? '--',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (t) => (
        <div className={cs.teeActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setEditTee({ tee: t, courseId }) }}
            title="Edit tee"
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleDeleteTee(courseId, t.id) }}
            title="Delete tee"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      {courseDetails.map((course) => (
        <div key={course.id} className={cs.courseCard}>
          <Card>
            <CardHeader
              title={course.course_name ?? course.display_name}
              onTitleClick={() => navigate(`/courses/${course.id}`)}
              action={
                <Badge>{course.holes ?? '?'} holes &middot; Par {course.par ?? '?'}</Badge>
              }
            />
            <DataTable
              columns={teeColumns(course.id)}
              data={course.tees}
              keyExtractor={(t) => t.id}
              emptyMessage="No tees"
            />
            <div className={cs.courseActions}>
              {courseDetails.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMergeOpen(course.id)}
                >
                  Merge
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/courses/${course.id}/map`)}
              >
                View Holes
              </Button>
            </div>
          </Card>
        </div>
      ))}

      <TeeEditModal
        isOpen={editTee !== null}
        onClose={() => setEditTee(null)}
        tee={editTee?.tee ?? null}
        courseId={editTee?.courseId ?? 0}
      />

      <TeeReassignModal
        isOpen={reassignState !== null}
        onClose={() => setReassignState(null)}
        courseId={reassignState?.courseId ?? 0}
        teeId={reassignState?.teeId ?? 0}
        conflict={reassignState?.conflict ?? null}
      />

      <CourseMergeModal
        isOpen={mergeSource !== null}
        onClose={() => setMergeSource(null)}
        sourceCourse={mergeSource}
        otherCourses={mergeTargets}
      />
    </>
  )
}
