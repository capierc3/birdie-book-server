import { useState } from 'react'
import { Button, ResponsiveSelect, Input, FormGroup } from '../../components'
import { useRoundPlansAvailable } from '../../api'
import type { WizardState } from './NewPracticePage'
import { PREDEFINED_TAGS, TAG_DISPLAY } from './constants'
import s from './NewPracticePage.module.css'

interface Props {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
  onNext: () => void
}

export function WizardStep1({ state, onChange, onNext }: Props) {
  const { data: roundPlans = [] } = useRoundPlansAvailable()
  const [customTag, setCustomTag] = useState('')

  const surpriseMe = state.focus_tags.includes('surprise_me')

  const toggleTag = (tag: string) => {
    if (tag === 'surprise_me') {
      onChange({ focus_tags: surpriseMe ? [] : ['surprise_me'] })
      return
    }
    const tags = state.focus_tags.filter((t) => t !== 'surprise_me')
    if (tags.includes(tag)) {
      onChange({ focus_tags: tags.filter((t) => t !== tag) })
    } else {
      onChange({ focus_tags: [...tags, tag] })
    }
  }

  const addCustomTag = () => {
    const tag = customTag.trim().toLowerCase().replace(/\s+/g, '_')
    if (tag && !state.focus_tags.includes(tag)) {
      onChange({ focus_tags: [...state.focus_tags, tag] })
    }
    setCustomTag('')
  }

  const canNext = !!state.plan_type

  return (
    <div>
      <div className={s.typeCards}>
        <div
          className={`${s.typeCard} ${state.plan_type === 'round_prep' ? s.selected : ''}`}
          onClick={() => onChange({ plan_type: 'round_prep' })}
        >
          <div className={s.typeCardTitle}>Prepare for a Round</div>
          <div className={s.typeCardDesc}>
            Practice specific clubs and shots for an upcoming round
          </div>
        </div>
        <div
          className={`${s.typeCard} ${state.plan_type === 'general' ? s.selected : ''}`}
          onClick={() => onChange({ plan_type: 'general' })}
        >
          <div className={s.typeCardTitle}>General Improvement</div>
          <div className={s.typeCardDesc}>
            Work on your biggest weaknesses based on strokes gained data
          </div>
        </div>
      </div>

      {state.plan_type === 'round_prep' && roundPlans.length > 0 && (
        <FormGroup label="Round Plan">
          <ResponsiveSelect
            value={state.round_plan_id?.toString() ?? ''}
            onChange={(v) =>
              onChange({
                round_plan_id: v ? Number(v) : null,
              })
            }
            options={[
              { value: '', label: 'Select a round plan...' },
              ...roundPlans.map((rp) => ({
                value: String(rp.id),
                label: `${rp.name} — ${rp.course_name}`,
              })),
            ]}
            title="Round Plan"
          />
        </FormGroup>
      )}

      <FormGroup label="Focus Tags (optional)">
        <div className={s.tagGrid} style={{ marginBottom: 12 }}>
          <button
            className={`${s.tagBtn} ${s.surprise} ${surpriseMe ? s.selected : ''}`}
            onClick={() => toggleTag('surprise_me')}
          >
            Surprise Me
          </button>
        </div>

        {Object.entries(PREDEFINED_TAGS).map(([category, tags]) => (
          <div key={category} className={s.tagSection}>
            <div className={s.tagSectionLabel}>{category}</div>
            <div className={s.tagGrid}>
              {tags.map((tag) => (
                <button
                  key={tag}
                  className={`${s.tagBtn} ${state.focus_tags.includes(tag) ? s.selected : ''}`}
                  onClick={() => toggleTag(tag)}
                  disabled={surpriseMe}
                >
                  {TAG_DISPLAY[tag] || tag}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className={s.customTagRow}>
          <Input
            placeholder="Add custom tag..."
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
            disabled={surpriseMe}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={addCustomTag}
            disabled={surpriseMe || !customTag.trim()}
          >
            Add
          </Button>
        </div>
      </FormGroup>

      <div className={s.actions}>
        <Button onClick={onNext} disabled={!canNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
