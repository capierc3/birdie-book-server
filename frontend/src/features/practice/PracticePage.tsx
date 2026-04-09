import { useNavigate } from 'react-router-dom'
import { Button, Badge, ProgressBar, EmptyState } from '../../components'
import { usePracticePlans } from '../../api'
import type { PracticePlanSummary } from '../../api'
import { formatDate } from '../../utils/format'
import { TAG_DISPLAY, PLAN_TYPE_LABELS, STATUS_VARIANTS, STATUS_LABELS } from './constants'
import styles from './PracticePage.module.css'
import pageStyles from '../../styles/pages.module.css'

export function PracticePage() {
  const navigate = useNavigate()
  const { data: plans = [], isLoading } = usePracticePlans()

  if (isLoading) return <div className={pageStyles.loading}>Loading...</div>

  return (
    <div>
      <div className={pageStyles.pageHeader}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={pageStyles.pageTitle}>Practice Plans</h1>
            <p className={pageStyles.pageDesc}>
              Smart practice recommendations based on your game data
            </p>
          </div>
          <Button onClick={() => navigate('/practice/new')}>
            New Practice Plan
          </Button>
        </div>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          message="No practice plans yet"
          description="Generate a smart practice plan based on your game data."
        />
      ) : (
        <div className={styles.grid}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onClick={() => navigate(`/practice/${plan.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PlanCard({
  plan,
  onClick,
}: {
  plan: PracticePlanSummary
  onClick: () => void
}) {
  const pct =
    plan.total_activities > 0
      ? Math.round((plan.completed_activities / plan.total_activities) * 100)
      : 0

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span className={styles.cardGoal}>
          {plan.goal || PLAN_TYPE_LABELS[plan.plan_type] || 'Practice Plan'}
        </span>
        <span className={styles.cardDate}>
          {plan.created_at ? formatDate(plan.created_at) : ''}
        </span>
      </div>

      {plan.round_plan_info?.course_name && (
        <div className={styles.cardCourse}>
          {plan.round_plan_info.course_name}
        </div>
      )}

      {plan.focus_tags && plan.focus_tags.length > 0 && (
        <div className={styles.cardTags}>
          {plan.focus_tags.slice(0, 5).map((t) => (
            <span key={t} className={styles.tag}>
              {TAG_DISPLAY[t] || t}
            </span>
          ))}
          {plan.focus_tags.length > 5 && (
            <span className={styles.tag}>+{plan.focus_tags.length - 5}</span>
          )}
        </div>
      )}

      <div className={styles.cardMeta}>
        <Badge variant={STATUS_VARIANTS[plan.status] ?? 'muted'}>
          {STATUS_LABELS[plan.status] ?? plan.status}
        </Badge>
        <span>
          {plan.session_count} session{plan.session_count !== 1 ? 's' : ''}
        </span>
        <span>
          {plan.completed_activities}/{plan.total_activities} activities
        </span>
      </div>

      {plan.total_activities > 0 && (
        <>
          <div className={styles.cardPct}>{pct}% complete</div>
          <ProgressBar value={pct} />
        </>
      )}
    </div>
  )
}
