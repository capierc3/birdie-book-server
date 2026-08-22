import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, ResponsiveSelect, StatusMessage } from '../../components'
import { useGolfClubs, useClubMergePreview, useMergeClub } from '../../api'
import cs from './ClubDetailPage.module.css'

// A club with one course leaves it unnamed, so two of those collide under an
// empty name rather than a matching one.
function describeDuplicates(names: string[]): string {
  const labelled = names.map((n) => (n ? `a course named "${n}"` : 'an unnamed course'))
  if (labelled.length === 1) return labelled[0]
  return `${labelled.slice(0, -1).join(', ')} and ${labelled[labelled.length - 1]}`
}

interface Props {
  isOpen: boolean
  onClose: () => void
  /** The club being merged away — it is deleted once its contents are moved. */
  sourceClubId: number
  sourceClubName: string
  onMerged: (targetId: number) => void
}

export function ClubMergeModal({ isOpen, onClose, sourceClubId, sourceClubName, onMerged }: Props) {
  const { data: clubs = [] } = useGolfClubs()
  const [targetId, setTargetId] = useState<number | undefined>(undefined)
  const [error, setError] = useState('')

  const preview = useClubMergePreview(targetId, isOpen ? sourceClubId : undefined)
  const merge = useMergeClub()

  useEffect(() => {
    if (isOpen) {
      setTargetId(undefined)
      setError('')
    }
  }, [isOpen])

  const others = useMemo(
    () => clubs
      .filter((c) => c.id !== sourceClubId)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [clubs, sourceClubId],
  )

  const handleMerge = async () => {
    if (!targetId) return
    setError('')
    try {
      await merge.mutateAsync({ targetId, sourceId: sourceClubId })
      onMerged(targetId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    }
  }

  const p = preview.data

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Merge "${sourceClubName}"`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {targetId && (
            <Button onClick={handleMerge} disabled={merge.isPending || preview.isLoading}>
              {merge.isPending ? 'Merging...' : 'Merge'}
            </Button>
          )}
        </>
      }
    >
      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
        Pick the club to keep. Every course, round, hazard and hole from{' '}
        <strong>{sourceClubName}</strong> moves there, then{' '}
        <strong>{sourceClubName}</strong> is deleted.
      </p>

      {others.length === 0 ? (
        <div className={cs.mergeInfo}>No other clubs to merge into.</div>
      ) : (
        <ResponsiveSelect
          value={targetId !== undefined ? String(targetId) : ''}
          onChange={(v) => setTargetId(v ? Number(v) : undefined)}
          options={[
            { value: '', label: 'Select club to keep...' },
            ...others.map((c) => ({
              value: String(c.id),
              label: `${c.name} (${c.course_count} course${c.course_count !== 1 ? 's' : ''})`,
            })),
          ]}
          title="Keep This Club"
        />
      )}

      {targetId && preview.isLoading && (
        <div style={{ marginTop: 16 }}>
          <StatusMessage variant="progress">Loading preview...</StatusMessage>
        </div>
      )}

      {targetId && p && (
        <div style={{ marginTop: 16 }}>
          <div className={cs.mergeInfo}>
            Moving to <strong>{p.target_name}</strong>:{' '}
            {p.courses_to_move} course{p.courses_to_move !== 1 ? 's' : ''},{' '}
            {p.tees_to_move} tee{p.tees_to_move !== 1 ? 's' : ''},{' '}
            {p.rounds_to_move} round{p.rounds_to_move !== 1 ? 's' : ''}
            {p.hazards_to_move > 0 && `, ${p.hazards_to_move} hazard${p.hazards_to_move !== 1 ? 's' : ''}`}
            {p.osm_holes_to_move > 0 && `, ${p.osm_holes_to_move} OSM hole${p.osm_holes_to_move !== 1 ? 's' : ''}`}
            .
          </div>

          {p.fields_filled.length > 0 && (
            <div className={cs.mergeInfo}>
              {p.target_name} will also pick up: {p.fields_filled.join(', ')}.
            </div>
          )}

          {p.duplicate_course_names.length > 0 ? (
            <div style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>
              Both clubs list {describeDuplicates(p.duplicate_course_names)}. This merge
              does not combine courses — once they sit side by side under{' '}
              {p.target_name}, use &ldquo;Merge&rdquo; on the course itself to fold them together.
            </div>
          ) : (
            <StatusMessage variant="success">
              No overlapping course names — ready to merge.
            </StatusMessage>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</div>
      )}
    </Modal>
  )
}
