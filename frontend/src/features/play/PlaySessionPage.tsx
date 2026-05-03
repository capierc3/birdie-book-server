import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import {
  usePlaySession,
  useUpdatePlaySession,
  useDeletePlaySession,
  useTags,
} from '../../api'
import type {
  PlaySessionDetail,
  PlaySessionState,
  PlaySessionUpdate,
} from '../../api'
import { Button, Card, CardHeader, FormGroup, Input, useConfirm } from '../../components'
import { TagPicker } from './TagPicker'
import { loadNote } from '../course-map/mobile/tabs/NotesTab'
import s from './PlaySessionPage.module.css'

/** Sum the per-hole scores stored in localStorage by NotesTab during play.
 * Returns null if no holes have a recorded score yet. */
function sumPlayScores(courseId: number | undefined, holesPlayed: number): number | null {
  if (courseId == null) return null
  let total = 0
  let any = false
  for (let h = 1; h <= holesPlayed; h++) {
    const score = loadNote(courseId, h).score
    if (score != null) {
      total += score
      any = true
    }
  }
  return any ? total : null
}

const STATE_LABEL: Record<PlaySessionState, string> = {
  PRE: 'Pre-round',
  COURSE_OVERVIEW: 'Course review',
  ACTIVE: 'In progress',
  COMPLETE: 'Complete',
  ABANDONED: 'Abandoned',
}

const STATE_CLASS: Record<PlaySessionState, string> = {
  PRE: s.statePre,
  COURSE_OVERVIEW: s.statePre,
  ACTIVE: s.stateActive,
  COMPLETE: s.stateComplete,
  ABANDONED: s.stateAbandoned,
}

const AUTOSAVE_DELAY_MS = 800

interface RatingRowProps {
  label: string
  description?: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  max?: number
  disabled?: boolean
}

function RatingRow({ label, description, value, onChange, max = 5, disabled }: RatingRowProps) {
  return (
    <div className={s.ratingRow}>
      <div className={s.ratingLabelGroup}>
        <div className={s.ratingLabel}>{label}</div>
        {description && <div className={s.ratingDescription}>{description}</div>}
      </div>
      <div className={s.ratingButtons}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`${s.ratingBtn} ${value === n ? s.ratingBtnActive : ''}`}
            onClick={() => onChange(value === n ? null : n)}
            disabled={disabled}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

interface LocalFields {
  body_rating: number | null
  mind_rating: number | null
  commitment_rating: number | null
  intention_notes: string
  intention_tag_ids: number[]
  bring_in_tag_ids: number[]
  pull_out_tag_ids: number[]
  overall_rating: number | null
  // Round goal — target score for the round, drives personal-par allocation.
  // Edited on the COURSE_OVERVIEW page; surfaced on every play screen.
  score_goal: number | null
  // Post-round reflection. `key_takeaway` and `next_focus` are reused as
  // "Keep" and "Release" prompts. `what_worked` / `what_struggled` are no
  // longer edited via the UI but stay in LocalFields so toUpdate doesn't
  // null them out for older sessions that already have content.
  pattern_tag_ids: number[]
  response_tag_ids: number[]
  what_worked: string
  what_struggled: string
  key_takeaway: string
  next_focus: string
  post_session_notes: string
  score: number | null
}

const INTENTION_MAX = 3

function fromDetail(d: PlaySessionDetail, tagsById: Map<number, 'bring_in' | 'pull_out' | 'intention' | 'pattern' | 'response'>): LocalFields {
  // Partition the session's tag_ids by category. Unknown ids fall through —
  // they'll be rendered by TagPicker's "Archived" group so they're still
  // editable.
  const bring: number[] = []
  const pull: number[] = []
  const intent: number[] = []
  const pattern: number[] = []
  const response: number[] = []
  for (const id of d.tag_ids ?? []) {
    const cat = tagsById.get(id)
    if (cat === 'bring_in') bring.push(id)
    else if (cat === 'pull_out') pull.push(id)
    else if (cat === 'intention') intent.push(id)
    else if (cat === 'pattern') pattern.push(id)
    else if (cat === 'response') response.push(id)
    else {
      // Unknown / archived tag — keep in bring_in by default so it's at
      // least visible to the user. The TagPicker for that category will
      // render it under "Archived" and let them remove it.
      bring.push(id)
    }
  }
  return {
    body_rating: d.body_rating ?? null,
    mind_rating: d.mind_rating ?? null,
    commitment_rating: d.commitment_rating ?? null,
    intention_notes: d.intention_notes ?? '',
    intention_tag_ids: intent,
    bring_in_tag_ids: bring,
    pull_out_tag_ids: pull,
    overall_rating: d.overall_rating ?? null,
    score_goal: d.score_goal ?? null,
    pattern_tag_ids: pattern,
    response_tag_ids: response,
    what_worked: d.what_worked ?? '',
    what_struggled: d.what_struggled ?? '',
    key_takeaway: d.key_takeaway ?? '',
    next_focus: d.next_focus ?? '',
    post_session_notes: d.post_session_notes ?? '',
    score: d.score ?? null,
  }
}

function toUpdate(f: LocalFields): PlaySessionUpdate {
  return {
    body_rating: f.body_rating,
    mind_rating: f.mind_rating,
    commitment_rating: f.commitment_rating,
    intention_notes: f.intention_notes || null,
    score_goal: f.score_goal,
    tag_ids: [
      ...f.intention_tag_ids,
      ...f.bring_in_tag_ids,
      ...f.pull_out_tag_ids,
      ...f.pattern_tag_ids,
      ...f.response_tag_ids,
    ],
    overall_rating: f.overall_rating,
    what_worked: f.what_worked || null,
    what_struggled: f.what_struggled || null,
    key_takeaway: f.key_takeaway || null,
    next_focus: f.next_focus || null,
    post_session_notes: f.post_session_notes || null,
    score: f.score,
  }
}

export function PlaySessionPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = id ? Number(id) : undefined
  const navigate = useNavigate()
  const { confirm } = useConfirm()
  const { data, isLoading } = usePlaySession(sessionId)
  const updateMutation = useUpdatePlaySession(sessionId ?? 0)
  const deleteMutation = useDeletePlaySession()
  const { data: allTags } = useTags()

  const [fields, setFields] = useState<LocalFields | null>(null)
  const [saveStatus, setSaveStatus] = useState<string>('')

  // Track the last snapshot synced from the server so auto-save doesn't fire on load.
  const lastSyncedRef = useRef<string>('')
  const saveTimerRef = useRef<number | null>(null)

  // Map tag id -> category, used by `fromDetail` to bucket attached tags.
  const tagCategoryById = useMemo(() => {
    const m = new Map<number, 'bring_in' | 'pull_out' | 'intention' | 'pattern' | 'response'>()
    for (const t of allTags ?? []) {
      if (t.category === 'bring_in' || t.category === 'pull_out' || t.category === 'intention'
          || t.category === 'pattern' || t.category === 'response') {
        m.set(t.id, t.category)
      }
    }
    return m
  }, [allTags])

  useEffect(() => {
    if (data && allTags) {
      const next = fromDetail(data, tagCategoryById)
      // Auto-populate Score from per-hole tap-counts saved during play, but only
      // when the server has no score yet — never clobber a value the user typed.
      if (next.score == null) {
        const summed = sumPlayScores(data.course_id ?? undefined, data.holes_played ?? 18)
        if (summed != null) next.score = summed
      }
      setFields(next)
      lastSyncedRef.current = JSON.stringify(next)
    }
  }, [data, allTags, tagCategoryById])

  // Auto-save: debounce PATCH whenever local fields diverge from last-synced snapshot.
  useEffect(() => {
    if (!fields || !data) return
    const isFrozen = data.state === 'COMPLETE' || data.state === 'ABANDONED'
    if (isFrozen) return

    const snapshot = JSON.stringify(fields)
    if (snapshot === lastSyncedRef.current) return

    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus('Saving…')
      try {
        await updateMutation.mutateAsync(toUpdate(fields))
        lastSyncedRef.current = snapshot
        setSaveStatus('Saved')
        window.setTimeout(() => setSaveStatus(''), 1200)
      } catch (e) {
        setSaveStatus(`Error: ${(e as Error).message}`)
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current)
    }
  }, [fields, data, updateMutation])

  if (!sessionId) return <div className={s.page}>Invalid session.</div>
  if (isLoading || !data || !fields) return <div className={s.page}>Loading…</div>

  const isFrozen = data.state === 'COMPLETE' || data.state === 'ABANDONED'
  const showPre = data.state === 'PRE' || data.state === 'COMPLETE' || data.state === 'ABANDONED'
  const showPost = data.state === 'ACTIVE' || data.state === 'COMPLETE' || data.state === 'ABANDONED'

  const update = <K extends keyof LocalFields>(key: K, value: LocalFields[K]) => {
    setFields((f) => (f ? { ...f, [key]: value } : f))
  }

  // Force pending auto-save to flush before a navigation-changing action.
  const flushPending = async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!fields) return
    const snapshot = JSON.stringify(fields)
    if (snapshot === lastSyncedRef.current) return
    await updateMutation.mutateAsync(toUpdate(fields))
    lastSyncedRef.current = snapshot
  }

  const goToMap = () => {
    if (data.course_id == null) return
    const params = new URLSearchParams({ mode: 'play' })
    if (data.tee_id != null) params.set('tee', String(data.tee_id))
    params.set('session', String(data.id))
    navigate(`/courses/${data.course_id}/map?${params.toString()}`)
  }

  const handleContinueToOverview = async () => {
    await flushPending()
    await updateMutation.mutateAsync({ state: 'COURSE_OVERVIEW' })
    navigate(`/play/sessions/${sessionId}/overview`)
  }

  const handleCompleteRound = async () => {
    await flushPending()
    await updateMutation.mutateAsync({ state: 'COMPLETE' })
    navigate('/play')
  }

  const handleAbandon = async () => {
    const ok = await confirm({
      title: 'Abandon round?',
      message: 'This marks the round as abandoned. You can still view it later.',
      confirmLabel: 'Abandon',
    })
    if (!ok) return
    await updateMutation.mutateAsync({ state: 'ABANDONED' })
    navigate('/play')
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete round?',
      message: 'This permanently deletes the play session and its weather samples.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await deleteMutation.mutateAsync(sessionId)
    navigate('/play')
  }

  return (
    <div className={s.page}>
      <button className={s.backLink} onClick={() => navigate('/play')}>
        <ArrowLeft size={14} /> Back to Play
      </button>

      <div className={s.header}>
        <h1 className={s.title}>{data.course_name || 'Round'}</h1>
        <div className={s.subtitle}>
          {data.date} · {data.tee_name || '—'} · {data.holes_played ?? 18} holes · {data.game_format}
        </div>
        <div className={s.stateBar}>
          <span className={`${s.stateBadge} ${STATE_CLASS[data.state]}`}>
            {STATE_LABEL[data.state]}
          </span>
          {saveStatus && <span className={s.saveStatus}>{saveStatus}</span>}
        </div>
      </div>

      {showPre && (
        <Card>
          <CardHeader title="Pre-Round" />
          <div className={s.cardBody}>
            <section className={s.preSection}>
              <RatingRow
                label="Body"
                description="How are you feeling physically?"
                value={fields.body_rating}
                onChange={(v) => update('body_rating', v)}
                disabled={isFrozen}
              />
              <RatingRow
                label="Mind"
                description="How are you feeling mentally?"
                value={fields.mind_rating}
                onChange={(v) => update('mind_rating', v)}
                disabled={isFrozen}
              />
              <RatingRow
                label="Commitment"
                description="How willing are you to trust yourself?"
                value={fields.commitment_rating}
                onChange={(v) => update('commitment_rating', v)}
                disabled={isFrozen}
              />
            </section>

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>What's my intention today?</h3>
              <TagPicker
                category="intention"
                selectedIds={fields.intention_tag_ids}
                onChange={(ids) => update('intention_tag_ids', ids)}
                disabled={isFrozen}
                maxSelection={INTENTION_MAX}
              />
              <FormGroup label="Anything else? (optional)">
                <Input
                  value={fields.intention_notes}
                  onChange={(e) => update('intention_notes', e.target.value)}
                  placeholder="One-line override for this round"
                  disabled={isFrozen}
                />
              </FormGroup>
            </section>

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>What am I bringing into this round?</h3>
              <p className={s.preSectionDescription}>Mentally / emotionally</p>
              <TagPicker
                category="bring_in"
                selectedIds={fields.bring_in_tag_ids}
                onChange={(ids) => update('bring_in_tag_ids', ids)}
                disabled={isFrozen}
              />
            </section>

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>What could pull me out of the present today?</h3>
              <TagPicker
                category="pull_out"
                selectedIds={fields.pull_out_tag_ids}
                onChange={(ids) => update('pull_out_tag_ids', ids)}
                disabled={isFrozen}
              />
            </section>
          </div>
        </Card>
      )}

      {showPost && (
        <Card>
          <CardHeader title="Post-Round" />
          <div className={s.cardBody}>
            <FormGroup label="Score">
              <Input
                type="number"
                value={fields.score ?? ''}
                onChange={(e) =>
                  update('score', e.target.value === '' ? null : Number(e.target.value))
                }
                placeholder="e.g. 82"
                disabled={isFrozen}
              />
            </FormGroup>
            <RatingRow
              label="Overall rating"
              value={fields.overall_rating}
              onChange={(v) => update('overall_rating', v)}
              disabled={isFrozen}
            />

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>What showed up?</h3>
              <p className={s.preSectionDescription}>Just observe patterns — no judging.</p>
              <TagPicker
                category="pattern"
                selectedIds={fields.pattern_tag_ids}
                onChange={(ids) => update('pattern_tag_ids', ids)}
                disabled={isFrozen}
              />
            </section>

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>How did I respond?</h3>
              <p className={s.preSectionDescription}>Improvement lives here — not in what happened, but how you handled it.</p>
              <TagPicker
                category="response"
                selectedIds={fields.response_tag_ids}
                onChange={(ids) => update('response_tag_ids', ids)}
                disabled={isFrozen}
              />
            </section>

            <section className={s.preSection}>
              <h3 className={s.preSectionTitle}>One to keep / One to release</h3>
              <FormGroup label="Keep">
                <Input
                  value={fields.key_takeaway}
                  onChange={(e) => update('key_takeaway', e.target.value)}
                  placeholder="Something that helped you"
                  disabled={isFrozen}
                />
              </FormGroup>
              <FormGroup label="Release">
                <Input
                  value={fields.next_focus}
                  onChange={(e) => update('next_focus', e.target.value)}
                  placeholder="Something you don't need next round"
                  disabled={isFrozen}
                />
              </FormGroup>
            </section>

            <FormGroup label="Anything else? (optional)">
              <textarea
                className={s.textarea}
                value={fields.post_session_notes}
                onChange={(e) => update('post_session_notes', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
          </div>
        </Card>
      )}

      <div className={s.actions}>
        {data.state === 'PRE' && (
          <Button variant="primary" onClick={handleContinueToOverview}>
            <MapIcon size={14} /> Review Course →
          </Button>
        )}
        {data.state === 'ACTIVE' && (
          <>
            <Button variant="secondary" onClick={goToMap}>
              <MapIcon size={14} /> Back to Map
            </Button>
            <Button variant="primary" onClick={handleCompleteRound}>
              Complete Round
            </Button>
          </>
        )}
        {!isFrozen && (
          <Button variant="ghost" className={s.dangerBtn} onClick={handleAbandon}>
            Abandon
          </Button>
        )}
        <Button variant="ghost" className={s.dangerBtn} onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </div>
  )
}
