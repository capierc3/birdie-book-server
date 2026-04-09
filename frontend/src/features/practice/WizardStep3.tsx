import { Button, Badge } from '../../components'
import type {
  GenerateSession,
  GenerateSessionActivity,
  AnalysisSummary,
} from '../../api'
import { SESSION_TYPE_LABELS, FOCUS_LABELS, FOCUS_COLORS } from './constants'
import { AnalysisSummaryCard } from './AnalysisSummary'
import s from './NewPracticePage.module.css'

interface Props {
  analysis: AnalysisSummary | null
  sessions: GenerateSession[]
  onEditActivity: (
    sessionIdx: number,
    activityIdx: number,
    activity: GenerateSessionActivity,
  ) => void
  onRemoveActivity: (sessionIdx: number, activityIdx: number) => void
  onAddActivity: (sessionIdx: number) => void
  onBack: () => void
  onSave: () => void
  isSaving: boolean
}

export function WizardStep3({
  analysis,
  sessions,
  onEditActivity,
  onRemoveActivity,
  onAddActivity,
  onBack,
  onSave,
  isSaving,
}: Props) {
  const totalActivities = sessions.reduce(
    (sum, sess) => sum + sess.activities.length,
    0,
  )

  return (
    <div>
      {analysis && <AnalysisSummaryCard analysis={analysis} />}

      <div style={{ marginBottom: 8, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {totalActivities} activities across {sessions.length} session
        {sessions.length !== 1 ? 's' : ''}
      </div>

      {sessions.map((sess, sIdx) => (
        <div key={sIdx} style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Badge variant="blue">
              {SESSION_TYPE_LABELS[sess.session_type] ?? sess.session_type}
            </Badge>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {sess.ball_count
                ? `${sess.ball_count} balls`
                : sess.duration_minutes
                  ? `${sess.duration_minutes} min`
                  : ''}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {sess.activities.length} activit
              {sess.activities.length !== 1 ? 'ies' : 'y'}
            </span>
          </div>

          {sess.activities.map((act, aIdx) => (
            <div key={aIdx} className={s.activityRow}>
              <div className={s.activityInfo}>
                <div>
                  <span className={s.activityClub}>
                    {act.club || 'Any Club'}
                  </span>
                  <span className={s.activityAmount}>
                    {act.ball_count
                      ? `${act.ball_count} balls`
                      : act.duration_minutes
                        ? `${act.duration_minutes} min`
                        : ''}
                  </span>
                  <span
                    className={s.activityFocus}
                    style={{
                      background: FOCUS_COLORS[act.focus_area] ?? '#888',
                      color: '#fff',
                    }}
                  >
                    {FOCUS_LABELS[act.focus_area] ?? act.focus_area}
                  </span>
                </div>
                {act.target_metric && (
                  <div className={s.activityTarget}>{act.target_metric}</div>
                )}
                {act.rationale && (
                  <div className={s.activityRationale}>{act.rationale}</div>
                )}
                {act.drill_name ? (
                  <div className={s.drillCard}>
                    <div className={s.drillName}>{act.drill_name}</div>
                    {act.notes && (
                      <div className={s.drillDesc}>{act.notes}</div>
                    )}
                    <div
                      className={s.drillLink}
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditActivity(sIdx, aIdx, act)
                      }}
                    >
                      change drill
                    </div>
                  </div>
                ) : (
                  <div
                    className={s.addDrillLink}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditActivity(sIdx, aIdx, act)
                    }}
                  >
                    + add drill
                  </div>
                )}
              </div>
              <div className={s.activityActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditActivity(sIdx, aIdx, act)}
                  title="Edit"
                >
                  &#9998;
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveActivity(sIdx, aIdx)}
                  style={{ color: 'var(--danger, #ef4444)' }}
                  title="Remove"
                >
                  &times;
                </Button>
              </div>
            </div>
          ))}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAddActivity(sIdx)}
            style={{ marginTop: 8 }}
          >
            + Add Activity
          </Button>
        </div>
      ))}

      <div className={s.actions}>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onSave} disabled={isSaving || totalActivities === 0}>
          {isSaving ? 'Saving...' : 'Save Plan'}
        </Button>
      </div>
    </div>
  )
}
