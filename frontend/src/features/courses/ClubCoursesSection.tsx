import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Card, CardHeader, DataTable, Badge, Button, Select } from '../../components'
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
    if (!window.confirm('Delete this tee and all its hole data?')) return
    try {
      await deleteTee.mutateAsync({ courseId, teeId })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          const detail = JSON.parse(e.message) as TeeDeleteConflict
          setReassignState({ courseId, teeId, conflict: detail })
        } catch {
          alert('This tee has linked rounds. Please reassign them first.')
        }
      } else {
        alert(e instanceof Error ? e.message : 'Failed to delete tee')
      }
    }
  }

  const handleMergeSelect = (sourceId: number, targetId: string) => {
    if (!targetId) return
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
                <Select
                  style={{ width: 'auto', fontSize: '0.85rem' }}
                  value=""
                  onChange={(e) => handleMergeSelect(course.id, e.target.value)}
                >
                  <option value="">Merge into...</option>
                  {courseDetails
                    .filter((c) => c.id !== course.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.course_name ?? c.display_name}
                      </option>
                    ))}
                </Select>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled
                title="Course editor coming soon"
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
