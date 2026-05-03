import { useState, useEffect } from 'react'
import { Modal, Button, ResponsiveSelect, StatusMessage } from '../../components'
import { useCourseMergePreview, useMergeCourse } from '../../api'
import type { MergeConflict } from '../../api'
import cs from './ClubDetailPage.module.css'

interface CourseOption {
  id: number
  name?: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  sourceCourse: CourseOption | null
  otherCourses: CourseOption[]
}

export function CourseMergeModal({ isOpen, onClose, sourceCourse, otherCourses }: Props) {
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [resolutions, setResolutions] = useState<Record<string, number>>({})
  const [error, setError] = useState('')

  const preview = useCourseMergePreview(targetId, sourceCourse?.id)
  const merge = useMergeCourse()

  useEffect(() => {
    if (isOpen) {
      setTargetId(undefined)
      setResolutions({})
      setError('')
    }
  }, [isOpen])

  const conflicts = preview.data?.conflicts ?? []
  const allResolved = conflicts.every((c) => c.field in resolutions)

  const handleMerge = async () => {
    if (!targetId || !sourceCourse) return
    setError('')
    try {
      await merge.mutateAsync({
        targetId,
        sourceId: sourceCourse.id,
        resolveHoles: resolutions['holes'],
        resolvePar: resolutions['par'],
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    }
  }

  const handleResolution = (field: string, value: number) => {
    setResolutions((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Merge "${sourceCourse?.name ?? 'Course'}"`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {targetId && (
            <Button
              onClick={handleMerge}
              disabled={merge.isPending || (conflicts.length > 0 && !allResolved)}
            >
              {merge.isPending ? 'Merging...' : 'Merge'}
            </Button>
          )}
        </>
      }
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Select a target course to merge this course into. Rounds and tees will be moved to the target.
      </p>

      <ResponsiveSelect
        value={targetId !== undefined ? String(targetId) : ''}
        onChange={(v) => setTargetId(v ? Number(v) : undefined)}
        options={[
          { value: '', label: 'Select target course...' },
          ...otherCourses.map((c) => ({
            value: String(c.id),
            label: c.name ?? `Course #${c.id}`,
          })),
        ]}
        title="Target Course"
      />

      {targetId && preview.isLoading && (
        <div style={{ marginTop: 16 }}>
          <StatusMessage variant="progress">Loading preview...</StatusMessage>
        </div>
      )}

      {targetId && preview.data && (
        <div style={{ marginTop: 16 }}>
          <div className={cs.mergeInfo}>
            {preview.data.rounds_to_move} round{preview.data.rounds_to_move !== 1 ? 's' : ''} and{' '}
            {preview.data.tees_to_move} tee{preview.data.tees_to_move !== 1 ? 's' : ''} will be moved.
          </div>

          {conflicts.length > 0 && (
            <>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 12, color: 'var(--warning)' }}>
                Resolve conflicts:
              </p>
              {conflicts.map((c: MergeConflict) => (
                <div key={c.field} className={cs.conflictField}>
                  <div className={cs.conflictLabel}>{c.label}</div>
                  <div className={cs.conflictOptions}>
                    <label className={cs.conflictOption}>
                      <input
                        type="radio"
                        name={c.field}
                        checked={resolutions[c.field] === c.target_value}
                        onChange={() => handleResolution(c.field, c.target_value)}
                      />
                      Keep target: {c.target_value}
                    </label>
                    <label className={cs.conflictOption}>
                      <input
                        type="radio"
                        name={c.field}
                        checked={resolutions[c.field] === c.source_value}
                        onChange={() => handleResolution(c.field, c.source_value)}
                      />
                      Keep source: {c.source_value}
                    </label>
                  </div>
                </div>
              ))}
            </>
          )}

          {conflicts.length === 0 && (
            <StatusMessage variant="success">No conflicts — ready to merge.</StatusMessage>
          )}
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
