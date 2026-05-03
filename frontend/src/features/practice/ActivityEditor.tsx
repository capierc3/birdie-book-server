import { useState, useEffect } from 'react'
import { Modal, Button, Input, ResponsiveSelect, FormGroup } from '../../components'
import { useClubs, useDrills } from '../../api'
import { FOCUS_AREAS, FOCUS_LABELS } from './constants'

export interface ActivityFormData {
  club: string | null
  club_id: number | null
  drill_id: number | null
  ball_count: number | null
  duration_minutes: number | null
  focus_area: string
  target_metric: string | null
  rationale: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ActivityFormData) => void
  initial?: Partial<ActivityFormData>
  sessionType?: string
  title?: string
}

export function ActivityEditor({
  isOpen,
  onClose,
  onSave,
  initial,
  sessionType,
  title = 'Edit Activity',
}: Props) {
  const { data: clubs = [] } = useClubs()
  const { data: drills = [] } = useDrills(
    sessionType ? { session_type: sessionType } : undefined,
  )

  const [form, setForm] = useState<ActivityFormData>({
    club: null,
    club_id: null,
    drill_id: null,
    ball_count: null,
    duration_minutes: null,
    focus_area: 'distance_control',
    target_metric: null,
    rationale: null,
  })

  useEffect(() => {
    if (isOpen && initial) {
      setForm({
        club: initial.club ?? null,
        club_id: initial.club_id ?? null,
        drill_id: initial.drill_id ?? null,
        ball_count: initial.ball_count ?? null,
        duration_minutes: initial.duration_minutes ?? null,
        focus_area: initial.focus_area ?? 'distance_control',
        target_metric: initial.target_metric ?? null,
        rationale: initial.rationale ?? null,
      })
    }
  }, [isOpen, initial])

  const handleClubChange = (clubId: string) => {
    if (!clubId) {
      setForm((f) => ({ ...f, club: null, club_id: null }))
      return
    }
    const club = clubs.find((c) => c.id === Number(clubId))
    setForm((f) => ({
      ...f,
      club_id: club ? club.id : null,
      club: club ? club.name || club.club_type : null,
    }))
  }

  const handleDrillChange = (drillId: string) => {
    if (!drillId) {
      setForm((f) => ({ ...f, drill_id: null }))
      return
    }
    const drill = drills.find((d) => d.id === Number(drillId))
    if (drill) {
      setForm((f) => ({
        ...f,
        drill_id: drill.id,
        target_metric: f.target_metric || drill.target || null,
      }))
    }
  }

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      }
    >
      <FormGroup label="Club">
        <ResponsiveSelect
          value={form.club_id?.toString() ?? ''}
          onChange={(v) => handleClubChange(v)}
          options={[
            { value: '', label: 'Any / Not specified' },
            ...clubs
              .filter((c) => !c.retired)
              .map((c) => ({
                value: String(c.id),
                label: c.name || c.club_type,
              })),
          ]}
          title="Club"
        />
      </FormGroup>

      <FormGroup label="Ball Count">
        <Input
          type="number"
          min={1}
          max={300}
          value={form.ball_count ?? ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              ball_count: e.target.value ? Number(e.target.value) : null,
            }))
          }
        />
      </FormGroup>

      <FormGroup label="Focus Area">
        <ResponsiveSelect
          value={form.focus_area}
          onChange={(v) =>
            setForm((f) => ({ ...f, focus_area: v }))
          }
          options={FOCUS_AREAS.map((fa) => ({
            value: fa,
            label: FOCUS_LABELS[fa],
          }))}
          title="Focus Area"
        />
      </FormGroup>

      <FormGroup label="Target Metric">
        <Input
          placeholder="e.g., carry 165-175yd"
          value={form.target_metric ?? ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              target_metric: e.target.value || null,
            }))
          }
        />
      </FormGroup>

      {drills.length > 0 && (
        <FormGroup label="Drill (optional)">
          <ResponsiveSelect
            value={form.drill_id?.toString() ?? ''}
            onChange={(v) => handleDrillChange(v)}
            options={[
              { value: '', label: 'None' },
              ...drills.map((d) => ({
                value: String(d.id),
                label: d.name,
              })),
            ]}
            title="Drill"
          />
        </FormGroup>
      )}
    </Modal>
  )
}
