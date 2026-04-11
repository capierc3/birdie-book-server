import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Button, useConfirm } from '../../components'
import { post } from '../../api'
import type { Club } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  targetClub: Club | null
  allClubs: Club[]
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  garmin: { label: 'G', color: '#4caf50' },
  rapsodo_mlm2pro: { label: 'R', color: '#f59e0b' },
  trackman: { label: 'T', color: '#3b82f6' },
  manual: { label: 'M', color: '#8b8f98' },
}

function clubSortKey(type: string): number {
  const t = type.toUpperCase()
  if (t === 'DRIVER') return 100
  const numMatch = t.match(/\d+/)
  const num = numMatch ? parseInt(numMatch[0], 10) : 5
  if (t.includes('WOOD')) return 200 + num
  if (t.includes('HYBRID')) return 300 + num
  if (t.includes('IRON')) return 400 + num
  if (t.includes('PITCHING')) return 500
  if (t.includes('GAP')) return 510
  if (t.includes('SAND')) return 520
  if (t.includes('LOB')) return 530
  if (t.includes('WEDGE')) return 540
  if (t === 'PUTTER') return 600
  return 700
}

export function ClubMergeModal({ isOpen, onClose, targetClub, allClubs }: Props) {
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  if (!targetClub) return null

  const otherClubs = allClubs
    .filter((c) => c.id !== targetClub.id && !c.retired)
    .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))

  const handleMerge = async (sourceClub: Club) => {
    const ok = await confirm({
      title: 'Merge Clubs',
      message: `Merge "${sourceClub.club_type}" into "${targetClub!.club_type}"? All shots from "${sourceClub.club_type}" will be moved to "${targetClub!.club_type}", and "${sourceClub.club_type}" will be deleted. This cannot be undone.`,
      confirmLabel: 'Merge',
    })
    if (!ok) return

    setMerging(true)
    setError('')
    try {
      await post(`/clubs/${targetClub.id}/merge/${sourceClub.id}`, {})
      await queryClient.invalidateQueries({ queryKey: ['clubs'] })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Club"
      subtitle={`Select a club to merge into ${targetClub.club_type}:`}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
      }
    >
      {error && <div style={{ color: 'var(--red, #ef5350)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {otherClubs.map((c) => {
          const badge = SOURCE_BADGES[c.source] ?? SOURCE_BADGES.manual
          return (
            <button
              key={c.id}
              onClick={() => handleMerge(c)}
              disabled={merging}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: 'var(--bg-elevated, #1a1d24)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                cursor: merging ? 'wait' : 'pointer', color: 'var(--text)',
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%',
                fontSize: '0.7rem', fontWeight: 700,
                background: c.color ?? badge.color, color: '#111',
              }}>
                {badge.label}
              </span>
              <span style={{ fontWeight: 600 }}>{c.club_type}</span>
              {c.name && <span style={{ color: 'var(--accent)', fontSize: '0.82rem' }}>"{c.name}"</span>}
              {c.model && <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{c.model}</span>}
            </button>
          )
        })}
        {otherClubs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>
            No other clubs to merge.
          </div>
        )}
      </div>
    </Modal>
  )
}
