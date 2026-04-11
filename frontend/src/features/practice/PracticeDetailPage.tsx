import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button,
  Badge,
  ProgressBar,
  Select,
  Card,
  useToast,
  useConfirm,
} from '../../components'
import {
  usePracticePlan,
  usePlanReview,
  useDeletePlan,
  useToggleActivity,
  useUpdateActivity,
  useAddActivity,
  useDeleteActivity,
  useUpdatePlan,
  useRangeSessions,
} from '../../api'
import type { PracticeActivity, PracticeSession } from '../../api'
import { formatDate } from '../../utils/format'
import {
  SESSION_TYPE_LABELS,
  FOCUS_LABELS,
  FOCUS_COLORS,
  PLAN_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  TAG_DISPLAY,
} from './constants'
import { ActivityEditor, type ActivityFormData } from './ActivityEditor'
import { AnalysisSummaryCard } from './AnalysisSummary'
import { PlanReview } from './PlanReview'
import s from './PracticeDetailPage.module.css'
import pageStyles from '../../styles/pages.module.css'

export function PracticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const planId = Number(id)
  const navigate = useNavigate()
  const { addToast } = useToast()
  const { confirm } = useConfirm()

  const { data: plan, isLoading } = usePracticePlan(planId)
  const { data: review } = usePlanReview(
    planId,
    plan?.status === 'completed',
  )
  const { data: rangeSessions = [] } = useRangeSessions()

  const deletePlan = useDeletePlan()
  const toggleActivity = useToggleActivity()
  const updateActivity = useUpdateActivity()
  const addActivity = useAddActivity()
  const deleteActivity = useDeleteActivity()
  const updatePlan = useUpdatePlan()

  const [editingActivity, setEditingActivity] = useState<{
    planId: number
    activity: PracticeActivity
    sessionType: string
  } | null>(null)

  const [addingToSession, setAddingToSession] = useState<{
    planId: number
    sessionId: number
    sessionType: string
  } | null>(null)

  if (isLoading) return <div className={pageStyles.loading}>Loading...</div>
  if (!plan) return <div className={pageStyles.loading}>Plan not found</div>

  const totalActivities = plan.sessions.reduce(
    (sum, sess) => sum + sess.activities.length,
    0,
  )
  const completedActivities = plan.sessions.reduce(
    (sum, sess) =>
      sum + sess.activities.filter((a) => a.completed).length,
    0,
  )
  const pct =
    totalActivities > 0
      ? Math.round((completedActivities / totalActivities) * 100)
      : 0

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete Plan',
      message: 'Delete this practice plan? This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    deletePlan.mutate(planId, {
      onSuccess: () => {
        addToast('Plan deleted', 'success')
        navigate('/practice')
      },
    })
  }

  const handleToggle = (activityId: number) => {
    toggleActivity.mutate({ planId, activityId })
  }

  const handleEditSave = (data: ActivityFormData) => {
    if (!editingActivity) return
    updateActivity.mutate({
      planId: editingActivity.planId,
      activityId: editingActivity.activity.id,
      ...data,
    })
    setEditingActivity(null)
  }

  const handleAddSave = (data: ActivityFormData) => {
    if (!addingToSession) return
    addActivity.mutate({
      planId: addingToSession.planId,
      sessionId: addingToSession.sessionId,
      ...data,
    })
    setAddingToSession(null)
  }

  const handleDeleteActivity = async (activityId: number) => {
    const ok = await confirm({
      title: 'Remove Activity',
      message: 'Remove this activity?',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    deleteActivity.mutate({ planId, activityId })
  }

  const handleLinkRange = (sessionId: string) => {
    updatePlan.mutate({
      planId,
      range_session_id: sessionId ? Number(sessionId) : 0,
    })
  }

  const handleUnlinkRange = () => {
    updatePlan.mutate({ planId, range_session_id: 0 })
  }

  return (
    <div>
      <div className={s.backLink} onClick={() => navigate('/practice')}>
        &larr; All Plans
      </div>

      <div className={s.headerRow}>
        <div className={s.headerLeft}>
          <div className={s.planTitle}>
            {plan.goal || PLAN_TYPE_LABELS[plan.plan_type] || 'Practice Plan'}
          </div>
          <div className={s.badges}>
            <Badge variant="blue">
              {PLAN_TYPE_LABELS[plan.plan_type] ?? plan.plan_type}
            </Badge>
            <Badge variant={STATUS_VARIANTS[plan.status] ?? 'muted'}>
              {STATUS_LABELS[plan.status] ?? plan.status}
            </Badge>
          </div>
          {plan.focus_tags && plan.focus_tags.length > 0 && (
            <div className={s.tags}>
              {plan.focus_tags.map((t) => (
                <span key={t} className={s.tag}>
                  {TAG_DISPLAY[t] || t}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={handleDelete}
          style={{ color: 'var(--danger, #ef4444)' }}
        >
          Delete
        </Button>
      </div>

      {/* Progress */}
      <div className={s.progressSection}>
        <div className={s.progressLabel}>
          {completedActivities}/{totalActivities} activities &middot; {pct}%
          complete
        </div>
        <ProgressBar value={pct} />
      </div>

      {/* Metadata cards */}
      <div className={s.metaCards}>
        {plan.round_plan_info && (
          <div className={s.metaCard}>
            <div className={s.metaTitle}>Linked Round Plan</div>
            <div className={s.metaValue}>{plan.round_plan_info.name}</div>
            <div className={s.metaValue} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {plan.round_plan_info.course_name}
            </div>
            {plan.round_plan_info.planned_date && (
              <div className={s.metaValue} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {formatDate(plan.round_plan_info.planned_date)}
              </div>
            )}
          </div>
        )}

        <div className={s.metaCard}>
          <div className={s.metaTitle}>Range Session</div>
          {plan.range_session_id ? (
            <>
              <div className={s.metaValue}>
                Linked to session #{plan.range_session_id}
              </div>
              <div className={s.linkRow}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(`/range/${plan.range_session_id}`)
                  }
                >
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUnlinkRange}
                  style={{ color: 'var(--danger, #ef4444)' }}
                >
                  Unlink
                </Button>
              </div>
            </>
          ) : (
            <div className={s.linkRow}>
              <Select
                onChange={(e) => handleLinkRange(e.target.value)}
                value=""
              >
                <option value="">Link a range session...</option>
                {rangeSessions.map((rs) => (
                  <option key={rs.id} value={rs.id}>
                    {formatDate(rs.session_date)} — {rs.shot_count} shots
                    {rs.title ? ` — ${rs.title}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Sessions & Activities */}
      {plan.sessions
        .slice()
        .sort((a, b) => a.session_order - b.session_order)
        .map((sess) => (
          <SessionBlock
            key={sess.id}
            session={sess}
            planId={planId}
            onToggle={handleToggle}
            onEdit={(activity) =>
              setEditingActivity({
                planId,
                activity,
                sessionType: sess.session_type,
              })
            }
            onDelete={handleDeleteActivity}
            onAdd={() =>
              setAddingToSession({
                planId,
                sessionId: sess.id,
                sessionType: sess.session_type,
              })
            }
          />
        ))}

      {/* Analysis Summary */}
      {plan.analysis && <AnalysisSummaryCard analysis={plan.analysis} />}

      {/* Review (completed plans only) */}
      {review && <PlanReview review={review} />}

      {/* Edit modal */}
      <ActivityEditor
        isOpen={!!editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={handleEditSave}
        initial={editingActivity?.activity}
        sessionType={editingActivity?.sessionType}
        title="Edit Activity"
      />

      {/* Add modal */}
      <ActivityEditor
        isOpen={!!addingToSession}
        onClose={() => setAddingToSession(null)}
        onSave={handleAddSave}
        sessionType={addingToSession?.sessionType}
        title="Add Activity"
      />
    </div>
  )
}

function SessionBlock({
  session,
  planId,
  onToggle,
  onEdit,
  onDelete,
  onAdd,
}: {
  session: PracticeSession
  planId: number
  onToggle: (activityId: number) => void
  onEdit: (activity: PracticeActivity) => void
  onDelete: (activityId: number) => void
  onAdd: () => void
}) {
  const completedCount = session.activities.filter((a) => a.completed).length

  return (
    <div className={s.sessionCard}>
      <div className={s.sessionHeader}>
        <span className={s.sessionType}>
          {SESSION_TYPE_LABELS[session.session_type] ?? session.session_type}
        </span>
        <span className={s.sessionMeta}>
          {session.ball_count
            ? `${session.ball_count} balls`
            : session.duration_minutes
              ? `${session.duration_minutes} min`
              : ''}
          {' \u00B7 '}
          {completedCount}/{session.activities.length} done
        </span>
      </div>

      {session.activities
        .slice()
        .sort((a, b) => a.activity_order - b.activity_order)
        .map((act) => (
          <div
            key={act.id}
            className={`${s.activityRow} ${act.completed ? s.completed : ''}`}
          >
            <input
              type="checkbox"
              className={s.activityCheck}
              checked={act.completed}
              onChange={() => onToggle(act.id)}
            />
            <div className={s.activityBody}>
              <div className={s.activityMain}>
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
                  {act.drill_description && (
                    <div className={s.drillDesc}>
                      {act.drill_description}
                    </div>
                  )}
                  <div
                    className={s.drillLink}
                    onClick={(e) => {
                      e.stopPropagation()
                      onEdit(act)
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
                    onEdit(act)
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
                onClick={() => onEdit(act)}
                title="Edit"
              >
                &#9998;
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(act.id)}
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
        onClick={onAdd}
        style={{ marginTop: 8 }}
      >
        + Add Activity
      </Button>
    </div>
  )
}
