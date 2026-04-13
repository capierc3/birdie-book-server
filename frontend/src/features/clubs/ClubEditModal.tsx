import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, FormGroup, useConfirm } from '../../components'
import { post, put } from '../../api'
import { del } from '../../api/client'
import type { Club } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
  club?: Club | null
}

export function ClubEditModal({ isOpen, onClose, club }: Props) {
  const queryClient = useQueryClient()
  const { confirm } = useConfirm()
  const isEdit = !!club

  const [clubType, setClubType] = useState('')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
  const [flex, setFlex] = useState('')
  const [loft, setLoft] = useState('')
  const [lie, setLie] = useState('')
  const [shaft, setShaft] = useState('')
  const [color, setColor] = useState('#888888')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setClubType(club?.club_type ?? '')
      setName(club?.name ?? '')
      setModel(club?.model ?? '')
      setFlex(club?.flex ?? '')
      setLoft(club?.loft_deg != null ? String(club.loft_deg) : '')
      setLie(club?.lie_deg != null ? String(club.lie_deg) : '')
      setShaft(club?.shaft_length_in != null ? String(club.shaft_length_in) : '')
      setColor(club?.color ?? '#888888')
      setError('')
      setSaving(false)
    }
  }, [isOpen, club])

  const handleSave = async () => {
    const trimType = clubType.trim()
    if (!trimType) {
      setError('Club type is required')
      return
    }

    const body = {
      club_type: trimType,
      name: name.trim() || null,
      model: model.trim() || null,
      flex: flex.trim() || null,
      loft_deg: loft ? parseFloat(loft) : null,
      lie_deg: lie ? parseFloat(lie) : null,
      shaft_length_in: shaft ? parseFloat(shaft) : null,
      color: color || null,
    }

    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await put(`/clubs/${club!.id}`, body)
      } else {
        await post('/clubs/', body)
      }
      await queryClient.invalidateQueries({ queryKey: ['clubs'] })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!club) return
    const ok = await confirm({
      title: 'Delete Club',
      message: `Delete "${club.club_type}"? Any linked shots will be unlinked. This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    setSaving(true)
    setError('')
    try {
      await del(`/clubs/${club.id}`)
      await queryClient.invalidateQueries({ queryKey: ['clubs'] })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Club' : 'Add Club'}
      maxWidth={520}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
              style={{ marginRight: 'auto', color: 'var(--red, #ef5350)' }}
            >
              Delete
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      }
    >
      {error && <div style={{ color: 'var(--red, #ef5350)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormGroup label="Club Type *">
          <Input
            value={clubType}
            onChange={(e) => setClubType(e.target.value)}
            placeholder="e.g. Driver, 7 Iron"
            disabled={isEdit && club?.source === 'garmin'}
          />
        </FormGroup>
        <FormGroup label="Custom Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Old Faithful"
          />
        </FormGroup>

        <FormGroup label="Model">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. Callaway Epic"
          />
        </FormGroup>
        <FormGroup label="Flex">
          <Input
            value={flex}
            onChange={(e) => setFlex(e.target.value)}
            placeholder="e.g. Stiff, Regular"
          />
        </FormGroup>

        <FormGroup label="Loft (deg)">
          <Input
            type="number"
            step="0.5"
            value={loft}
            onChange={(e) => setLoft(e.target.value)}
          />
        </FormGroup>
        <FormGroup label="Lie (deg)">
          <Input
            type="number"
            step="0.5"
            value={lie}
            onChange={(e) => setLie(e.target.value)}
          />
        </FormGroup>

        <FormGroup label="Shaft Length (in)">
          <Input
            type="number"
            step="0.25"
            value={shaft}
            onChange={(e) => setShaft(e.target.value)}
          />
        </FormGroup>
        <FormGroup label="Color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{
              width: 48, height: 34, padding: 2,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)',
              cursor: 'pointer',
            }}
          />
        </FormGroup>
      </div>
    </Modal>
  )
}
