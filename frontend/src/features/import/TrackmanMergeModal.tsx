import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Button } from '../../components'
import { post } from '../../api/client'
import type { MergeSuggestion } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  suggestions: MergeSuggestion[]
}

const SOURCE_LABELS: Record<string, string> = {
  garmin: 'Garmin',
  rapsodo: 'Rapsodo',
  trackman: 'Trackman',
  manual: 'Manual',
}

export function TrackmanMergeModal({ isOpen, onClose, suggestions }: Props) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState(0)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  if (!suggestions.length) return null

  const suggestion = suggestions[current]
  if (!suggestion) return null

  const handleMerge = async (targetId: number) => {
    setMerging(true)
    setError('')
    try {
      await post(`/clubs/${targetId}/merge/${suggestion.new_club_id}`, {})
      await queryClient.invalidateQueries({ queryKey: ['clubs'] })
      advance()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  const advance = () => {
    if (current + 1 < suggestions.length) {
      setCurrent((c) => c + 1)
      setError('')
    } else {
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Duplicate Clubs"
      subtitle={`${current + 1} of ${suggestions.length} — A new "${suggestion.club_type}" was created during import.`}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={advance} disabled={merging}>
            Skip
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={merging}>
            Skip All
          </Button>
        </div>
      }
    >
      {error && (
        <div style={{ color: 'var(--red, #ef5350)', fontSize: '0.85rem', marginBottom: 12 }}>
          {error}
        </div>
      )}

      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        Merge the new Trackman club into an existing club? All shots will be moved to the target.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {suggestion.candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => handleMerge(c.id)}
            disabled={merging}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: 'var(--bg-elevated, #1a1d24)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              cursor: merging ? 'wait' : 'pointer',
              color: 'var(--text)',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{ fontWeight: 600 }}>{c.club_type}</span>
            {c.model && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{c.model}</span>
            )}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
              }}
            >
              {SOURCE_LABELS[c.source] || c.source}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  )
}
