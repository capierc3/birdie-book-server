import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, FormGroup, useConfirm } from '../../components'
import { post } from '../../api'
import type { Club, ClubShot } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  shot: ClubShot | null
  currentClubId: number
  allClubs: Club[]
}

const SOURCE_BADGES: Record<string, { label: string; color: string }> = {
  garmin: { label: 'G', color: '#4caf50' },
  rapsodo: { label: 'R', color: '#f59e0b' },
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

function getShotType(source: string): string {
  if (source === 'garmin') return 'course'
  if (source === 'trackman') return 'trackman'
  return 'range'
}

export function ShotEditModal({ isOpen, onClose, shot, currentClubId, allClubs }: Props) {
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // New club form
  const [newType, setNewType] = useState('')
  const [newName, setNewName] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newFlex, setNewFlex] = useState('')
  const [newLoft, setNewLoft] = useState('')
  const [newLie, setNewLie] = useState('')

  if (!shot) return null

  const otherClubs = allClubs
    .filter((c) => c.id !== currentClubId && !c.retired)
    .sort((a, b) => clubSortKey(a.club_type) - clubSortKey(b.club_type))

  const shotType = getShotType(shot.source)

  const invalidateAndClose = async () => {
    await queryClient.invalidateQueries({ queryKey: ['clubs'] })
    await queryClient.invalidateQueries({ queryKey: ['clubs', currentClubId, 'detail'] })
    onClose()
  }

  const handleReassign = async (targetClubId: number) => {
    setBusy(true)
    setError('')
    try {
      await post('/clubs/reassign-shot', {
        shot_type: shotType,
        shot_id: shot.raw_id,
        target_club_id: targetClubId,
      })
      await invalidateAndClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reassign failed')
    } finally {
      setBusy(false)
    }
  }

  const handleCreateAndAssign = async () => {
    const trimType = newType.trim()
    if (!trimType) {
      setError('Club type is required')
      return
    }
    setBusy(true)
    setError('')
    try {
      await post('/clubs/reassign-shot', {
        shot_type: shotType,
        shot_id: shot.raw_id,
        new_club: {
          club_type: trimType,
          name: newName.trim() || null,
          model: newModel.trim() || null,
          flex: newFlex.trim() || null,
          loft_deg: newLoft ? parseFloat(newLoft) : null,
          lie_deg: newLie ? parseFloat(newLie) : null,
        },
      })
      await invalidateAndClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create & assign failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Shot',
      message: 'Delete this shot? This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      await post('/clubs/delete-shot', {
        shot_type: shotType,
        shot_id: shot.raw_id,
      })
      await invalidateAndClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Shot"
      maxWidth={480}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={busy}
            style={{ color: 'var(--red, #ef5350)', border: '1px solid var(--red, #ef5350)' }}
          >
            Delete Shot
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      {error && <div style={{ color: 'var(--red, #ef5350)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}

      {/* Your Bag — club list */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', fontWeight: 600, fontSize: '0.78rem',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
        }}>
          Your Bag
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {otherClubs.map((c) => {
            const badge = SOURCE_BADGES[c.source] ?? SOURCE_BADGES.manual
            return (
              <button
                key={c.id}
                onClick={() => handleReassign(c.id)}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)',
                  color: 'var(--text)', cursor: busy ? 'wait' : 'pointer',
                  fontSize: '0.88rem',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  fontSize: '0.65rem', fontWeight: 700,
                  background: c.color ?? badge.color, color: '#111', flexShrink: 0,
                }}>
                  {badge.label}
                </span>
                <strong>{c.club_type}</strong>
                {(c.name || c.model) && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    &mdash; {c.name ? `"${c.name}"` : ''}{c.name && c.model ? ' ' : ''}{c.model ?? ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Create New Club */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px', fontWeight: 600, fontSize: '0.78rem',
          textTransform: 'uppercase', letterSpacing: '0.5px',
          color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
        }}>
          Create New Club
        </div>
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <FormGroup label="Club Type *">
            <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="e.g. Driver" />
          </FormGroup>
          <FormGroup label="Name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Old Faithful" />
          </FormGroup>
          <FormGroup label="Model">
            <Input value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="e.g. Callaway Epic" />
          </FormGroup>
          <FormGroup label="Flex">
            <Input value={newFlex} onChange={(e) => setNewFlex(e.target.value)} placeholder="e.g. Stiff" />
          </FormGroup>
          <FormGroup label="Loft">
            <Input type="number" step="0.5" value={newLoft} onChange={(e) => setNewLoft(e.target.value)} />
          </FormGroup>
          <FormGroup label="Lie">
            <Input type="number" step="0.5" value={newLie} onChange={(e) => setNewLie(e.target.value)} />
          </FormGroup>
        </div>
        <div style={{ padding: '0 12px 12px', textAlign: 'right' }}>
          <Button variant="primary" size="sm" onClick={handleCreateAndAssign} disabled={busy}>
            Create &amp; Assign
          </Button>
        </div>
      </div>
    </Modal>
  )
}
