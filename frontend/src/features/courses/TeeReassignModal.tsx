import { useState } from 'react'
import { Modal, Button, Select } from '../../components'
import { useReassignTeeRounds } from '../../api'
import type { TeeDeleteConflict } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  courseId: number
  teeId: number
  conflict: TeeDeleteConflict | null
}

export function TeeReassignModal({ isOpen, onClose, courseId, teeId, conflict }: Props) {
  const reassign = useReassignTeeRounds()
  const [targetTeeId, setTargetTeeId] = useState<number | null>(null)
  const [error, setError] = useState('')

  if (!conflict) return null

  const handleReassign = async () => {
    if (targetTeeId == null) return
    setError('')
    try {
      const assignments: Record<number, number> = {}
      for (const round of conflict.rounds) {
        assignments[round.id] = targetTeeId
      }
      await reassign.mutateAsync({ courseId, teeId, assignments })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reassign')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reassign Rounds"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleReassign} disabled={reassign.isPending || targetTeeId == null}>
            {reassign.isPending ? 'Reassigning...' : 'Reassign & Delete'}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 16 }}>
        This tee has <strong>{conflict.rounds.length}</strong> round{conflict.rounds.length !== 1 ? 's' : ''} linked.
        Choose a tee to move them to before deleting.
      </p>

      <div style={{ marginBottom: 12 }}>
        {conflict.rounds.map((r) => (
          <div key={r.id} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '4px 0' }}>
            Round #{r.id} &mdash; {r.date}{r.total_strokes ? ` (${r.total_strokes} strokes)` : ''}
          </div>
        ))}
      </div>

      {conflict.available_tees.length > 0 ? (
        <Select
          value={targetTeeId ?? ''}
          onChange={(e) => setTargetTeeId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select target tee...</option>
          {conflict.available_tees.map((t) => (
            <option key={t.id} value={t.id}>{t.tee_name}</option>
          ))}
        </Select>
      ) : (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>
          No other tees available. Add another tee before deleting this one.
        </p>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
