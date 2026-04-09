import { Button, Select, Input, FormGroup } from '../../components'
import type { WizardState, SessionSpec } from './NewPracticePage'
import {
  SESSION_TYPE_LABELS,
  SESSION_TYPES,
  BALL_BASED_SESSIONS,
  BALL_DEFAULTS,
} from './constants'
import s from './NewPracticePage.module.css'

interface Props {
  state: WizardState
  onChange: (patch: Partial<WizardState>) => void
  onBack: () => void
  onGenerate: () => void
  isGenerating: boolean
}

export function WizardStep2({
  state,
  onChange,
  onBack,
  onGenerate,
  isGenerating,
}: Props) {
  const sessions = state.sessions

  const addSession = () => {
    const newSession: SessionSpec = {
      session_type: 'trackman_range',
      ball_count: BALL_DEFAULTS['trackman_range'],
      duration_minutes: null,
    }
    onChange({ sessions: [...sessions, newSession] })
  }

  const updateSession = (idx: number, patch: Partial<SessionSpec>) => {
    const updated = sessions.map((sess, i) => {
      if (i !== idx) return sess
      const merged = { ...sess, ...patch }
      // When session_type changes, reset ball/duration based on type
      if (patch.session_type) {
        if (BALL_BASED_SESSIONS.has(patch.session_type)) {
          merged.ball_count = BALL_DEFAULTS[patch.session_type] ?? 60
          merged.duration_minutes = null
        } else {
          merged.ball_count = null
          merged.duration_minutes = 30
        }
      }
      return merged
    })
    onChange({ sessions: updated })
  }

  const removeSession = (idx: number) => {
    onChange({ sessions: sessions.filter((_, i) => i !== idx) })
  }

  const canGenerate = sessions.length > 0

  return (
    <div>
      {sessions.map((sess, idx) => {
        const isBallBased = BALL_BASED_SESSIONS.has(sess.session_type)
        return (
          <div key={idx} className={s.sessionCard}>
            <div className={s.sessionHeader}>
              <span className={s.sessionTitle}>Session {idx + 1}</span>
              {sessions.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSession(idx)}
                  style={{ color: 'var(--danger, #ef4444)' }}
                >
                  Remove
                </Button>
              )}
            </div>

            <FormGroup label="Session Type">
              <Select
                value={sess.session_type}
                onChange={(e) =>
                  updateSession(idx, { session_type: e.target.value })
                }
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SESSION_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </FormGroup>

            <div className={s.sessionFields}>
              {isBallBased ? (
                <FormGroup label="Ball Count">
                  <Input
                    type="number"
                    min={20}
                    max={300}
                    value={sess.ball_count ?? ''}
                    onChange={(e) =>
                      updateSession(idx, {
                        ball_count: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </FormGroup>
              ) : (
                <FormGroup label="Duration (minutes)">
                  <Input
                    type="number"
                    min={10}
                    max={300}
                    value={sess.duration_minutes ?? ''}
                    onChange={(e) =>
                      updateSession(idx, {
                        duration_minutes: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </FormGroup>
              )}
            </div>
          </div>
        )
      })}

      <Button variant="secondary" onClick={addSession}>
        + Add Session
      </Button>

      <div className={s.actions}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate Plan'}
        </Button>
      </div>
    </div>
  )
}
