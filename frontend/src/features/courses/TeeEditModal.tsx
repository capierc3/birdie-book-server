import { useState, useEffect } from 'react'
import { Modal, Button, Input, FormGroup } from '../../components'
import { useUpdateTee } from '../../api'
import type { CourseTee } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  tee: CourseTee | null
  courseId: number
}

export function TeeEditModal({ isOpen, onClose, tee, courseId }: Props) {
  const updateTee = useUpdateTee()
  const [teeName, setTeeName] = useState('')
  const [parTotal, setParTotal] = useState('')
  const [totalYards, setTotalYards] = useState('')
  const [courseRating, setCourseRating] = useState('')
  const [slopeRating, setSlopeRating] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && tee) {
      setTeeName(tee.tee_name ?? '')
      setParTotal(tee.par_total != null ? String(tee.par_total) : '')
      setTotalYards(tee.total_yards != null ? String(tee.total_yards) : '')
      setCourseRating(tee.course_rating != null ? String(tee.course_rating) : '')
      setSlopeRating(tee.slope_rating != null ? String(tee.slope_rating) : '')
      setError('')
    }
  }, [isOpen, tee])

  const handleSave = async () => {
    if (!tee) return
    setError('')
    try {
      await updateTee.mutateAsync({
        courseId,
        teeId: tee.id,
        body: {
          tee_name: teeName || undefined,
          par_total: parTotal ? Number(parTotal) : null,
          total_yards: totalYards ? Number(totalYards) : null,
          course_rating: courseRating ? Number(courseRating) : null,
          slope_rating: slopeRating ? Number(slopeRating) : null,
        },
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Tee"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateTee.isPending}>
            {updateTee.isPending ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormGroup label="Tee Name">
            <Input value={teeName} onChange={(e) => setTeeName(e.target.value)} />
          </FormGroup>
        </div>
        <FormGroup label="Par">
          <Input type="number" value={parTotal} onChange={(e) => setParTotal(e.target.value)} />
        </FormGroup>
        <FormGroup label="Total Yards">
          <Input type="number" value={totalYards} onChange={(e) => setTotalYards(e.target.value)} />
        </FormGroup>
        <FormGroup label="Course Rating">
          <Input type="number" step="0.1" value={courseRating} onChange={(e) => setCourseRating(e.target.value)} />
        </FormGroup>
        <FormGroup label="Slope Rating">
          <Input type="number" value={slopeRating} onChange={(e) => setSlopeRating(e.target.value)} />
        </FormGroup>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
