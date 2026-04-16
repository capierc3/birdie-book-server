import { useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGeneratePlan, useSavePlan } from '../../api'
import type {
  GenerateSession,
  GenerateSessionActivity,
  AnalysisSummary,
} from '../../api'
import { useToast } from '../../components'
import { BALL_DEFAULTS } from './constants'
import { WizardStep1 } from './WizardStep1'
import { WizardStep2 } from './WizardStep2'
import { WizardStep3 } from './WizardStep3'
import { ActivityEditor, type ActivityFormData } from './ActivityEditor'
import s from './NewPracticePage.module.css'
import pageStyles from '../../styles/pages.module.css'

export interface SessionSpec {
  session_type: string
  ball_count: number | null
  duration_minutes: number | null
}

export interface WizardState {
  plan_type: string | null
  round_plan_id: number | null
  goal: string | null
  focus_tags: string[]
  sessions: SessionSpec[]
}

const INITIAL_STATE: WizardState = {
  plan_type: null,
  round_plan_id: null,
  goal: null,
  focus_tags: [],
  sessions: [
    {
      session_type: 'trackman_range',
      ball_count: BALL_DEFAULTS['trackman_range'],
      duration_minutes: null,
    },
  ],
}

export function NewPracticePage() {
  const navigate = useNavigate()
  const { roundPlanId } = useParams<{ roundPlanId?: string }>()
  const { addToast } = useToast()

  const generateMutation = useGeneratePlan()
  const saveMutation = useSavePlan()

  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(() => ({
    ...INITIAL_STATE,
    plan_type: roundPlanId ? 'round_prep' : null,
    round_plan_id: roundPlanId ? Number(roundPlanId) : null,
  }))

  // Generated result
  const [generatedSessions, setGeneratedSessions] = useState<GenerateSession[]>([])
  const [analysis, setAnalysis] = useState<AnalysisSummary | null>(null)
  const [analysisSnapshot, setAnalysisSnapshot] = useState<string | null>(null)

  // Activity editor state


  const [editingActivity, setEditingActivity] = useState<{
    sessionIdx: number
    activityIdx: number
    activity: GenerateSessionActivity
    sessionType: string
  } | null>(null)

  const updateState = useCallback(
    (patch: Partial<WizardState>) =>
      setState((prev) => ({ ...prev, ...patch })),
    [],
  )

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({
        plan_type: state.plan_type!,
        round_plan_id: state.round_plan_id,
        goal: state.goal,
        focus_tags:
          state.focus_tags.length > 0 ? state.focus_tags : undefined,
        sessions: state.sessions.map((sess) => ({
          session_type: sess.session_type,
          ball_count: sess.ball_count,
          duration_minutes: sess.duration_minutes,
        })),
      })
      setGeneratedSessions(result.sessions)
      setAnalysis(result.analysis)
      setAnalysisSnapshot(JSON.stringify(result.analysis))
      setStep(3)
    } catch (err) {
      addToast('Failed to generate plan', 'error')
    }
  }

  const handleEditActivity = (
    sessionIdx: number,
    activityIdx: number,
    activity: GenerateSessionActivity,
  ) => {
    setEditingActivity({
      sessionIdx,
      activityIdx,
      activity,
      sessionType: generatedSessions[sessionIdx].session_type,
    })
  }

  const handleSaveActivity = (data: ActivityFormData) => {
    if (!editingActivity) return
    const { sessionIdx, activityIdx } = editingActivity
    setGeneratedSessions((prev) =>
      prev.map((sess, sIdx) => {
        if (sIdx !== sessionIdx) return sess
        return {
          ...sess,
          activities: sess.activities.map((act, aIdx) => {
            if (aIdx !== activityIdx) return act
            return { ...act, ...data }
          }),
        }
      }),
    )
    setEditingActivity(null)
  }

  const handleRemoveActivity = (sessionIdx: number, activityIdx: number) => {
    setGeneratedSessions((prev) =>
      prev.map((sess, sIdx) => {
        if (sIdx !== sessionIdx) return sess
        return {
          ...sess,
          activities: sess.activities.filter((_, aIdx) => aIdx !== activityIdx),
        }
      }),
    )
  }

  const handleAddActivity = (sessionIdx: number) => {
    const newActivity: GenerateSessionActivity = {
      activity_order: generatedSessions[sessionIdx].activities.length + 1,
      club: null,
      club_id: null,
      drill_id: null,
      ball_count: 10,
      duration_minutes: null,
      focus_area: 'distance_control',
      sg_category: null,
      rationale: null,
      target_metric: null,
      notes: null,
    }
    setEditingActivity({
      sessionIdx,
      activityIdx: generatedSessions[sessionIdx].activities.length,
      activity: newActivity,
      sessionType: generatedSessions[sessionIdx].session_type,
    })
    // Add activity to the session so edit can update it
    setGeneratedSessions((prev) =>
      prev.map((sess, sIdx) => {
        if (sIdx !== sessionIdx) return sess
        return {
          ...sess,
          activities: [...sess.activities, newActivity],
        }
      }),
    )
  }

  const handleSave = () => {
    if (saveMutation.isPending) return
    saveMutation.mutate(
      {
        plan_type: state.plan_type!,
        round_plan_id: state.round_plan_id,
        goal: state.goal,
        focus_tags:
          state.focus_tags.length > 0 ? state.focus_tags : undefined,
        analysis_snapshot: analysisSnapshot,
        sessions: generatedSessions.map((sess, sIdx) => ({
          session_order: sIdx + 1,
          session_type: sess.session_type,
          ball_count: sess.ball_count,
          duration_minutes: sess.duration_minutes,
          activities: sess.activities.map((act, aIdx) => ({
            activity_order: aIdx + 1,
            club: act.club,
            club_id: act.club_id,
            drill_id: act.drill_id,
            ball_count: act.ball_count,
            duration_minutes: act.duration_minutes,
            focus_area: act.focus_area,
            sg_category: act.sg_category,
            rationale: act.rationale,
            target_metric: act.target_metric,
            notes: act.notes,
          })),
        })),
      },
      {
        onSuccess: () => {
          navigate('/practice')
          addToast('Practice plan saved', 'success')
        },
        onError: () => {
          addToast('Failed to save plan', 'error')
        },
      },
    )
  }

  const stepLabels = ['Plan Type', 'Sessions', 'Review']

  return (
    <div>
      <div className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>New Practice Plan</h1>
        <p className={pageStyles.pageDesc}>
          Set your goal and sessions, then get smart recommendations
        </p>
      </div>

      {/* Step indicator */}
      <div className={s.steps}>
        {stepLabels.map((label, i) => {
          const stepNum = i + 1
          const isActive = step === stepNum
          const isDone = step > stepNum
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div
                  className={s.stepLine}
                  style={isDone || isActive ? { background: 'var(--accent)' } : undefined}
                />
              )}
              <div
                className={`${s.step} ${isActive ? s.active : ''} ${isDone ? s.done : ''}`}
              >
                <div className={s.stepNum}>
                  {isDone ? '\u2713' : stepNum}
                </div>
                <span className={s.stepLabel}>{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.body}>
        {step === 1 && (
          <WizardStep1
            state={state}
            onChange={updateState}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <WizardStep2
            state={state}
            onChange={updateState}
            onBack={() => setStep(1)}
            onGenerate={handleGenerate}
            isGenerating={generateMutation.isPending}
          />
        )}

        {step === 2 && generateMutation.isPending && (
          <div className={s.generating}>
            <div className={s.spinner} />
            <div>Analyzing your game data and generating recommendations...</div>
          </div>
        )}

        {step === 3 && (
          <WizardStep3
            analysis={analysis}
            sessions={generatedSessions}
            onEditActivity={handleEditActivity}
            onRemoveActivity={handleRemoveActivity}
            onAddActivity={handleAddActivity}
            onBack={() => setStep(2)}
            onSave={handleSave}
            isSaving={saveMutation.isPending}
          />
        )}
      </div>

      <ActivityEditor
        isOpen={!!editingActivity}
        onClose={() => setEditingActivity(null)}
        onSave={handleSaveActivity}
        initial={editingActivity?.activity}
        sessionType={editingActivity?.sessionType}
        title={editingActivity ? 'Edit Activity' : 'Add Activity'}
      />
    </div>
  )
}
