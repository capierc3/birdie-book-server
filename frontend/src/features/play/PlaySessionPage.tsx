import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CloudSun, Map as MapIcon } from 'lucide-react'
import {
  usePlaySession,
  useUpdatePlaySession,
  useDeletePlaySession,
  useSampleWeather,
} from '../../api'
import type {
  PlaySessionDetail,
  PlaySessionState,
  PlaySessionUpdate,
  PlaySessionWeatherSample,
} from '../../api'
import { Button, Card, CardHeader, FormGroup, Input, useConfirm } from '../../components'
import s from './PlaySessionPage.module.css'

const STATE_LABEL: Record<PlaySessionState, string> = {
  PRE: 'Pre-round',
  ACTIVE: 'In progress',
  COMPLETE: 'Complete',
  ABANDONED: 'Abandoned',
}

const STATE_CLASS: Record<PlaySessionState, string> = {
  PRE: s.statePre,
  ACTIVE: s.stateActive,
  COMPLETE: s.stateComplete,
  ABANDONED: s.stateAbandoned,
}

const AUTOSAVE_DELAY_MS = 800

interface RatingRowProps {
  label: string
  value: number | null | undefined
  onChange: (v: number | null) => void
  max?: number
  disabled?: boolean
}

function RatingRow({ label, value, onChange, max = 5, disabled }: RatingRowProps) {
  return (
    <div className={s.ratingRow}>
      <div className={s.ratingLabel}>{label}</div>
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
  energy_rating: number | null
  focus_rating: number | null
  physical_rating: number | null
  pre_session_notes: string
  session_goals: string
  clubs_focused: string
  overall_rating: number | null
  what_worked: string
  what_struggled: string
  key_takeaway: string
  next_focus: string
  post_session_notes: string
  score: number | null
}

function fromDetail(d: PlaySessionDetail): LocalFields {
  return {
    energy_rating: d.energy_rating ?? null,
    focus_rating: d.focus_rating ?? null,
    physical_rating: d.physical_rating ?? null,
    pre_session_notes: d.pre_session_notes ?? '',
    session_goals: d.session_goals ?? '',
    clubs_focused: d.clubs_focused ?? '',
    overall_rating: d.overall_rating ?? null,
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
    energy_rating: f.energy_rating,
    focus_rating: f.focus_rating,
    physical_rating: f.physical_rating,
    pre_session_notes: f.pre_session_notes || null,
    session_goals: f.session_goals || null,
    clubs_focused: f.clubs_focused || null,
    overall_rating: f.overall_rating,
    what_worked: f.what_worked || null,
    what_struggled: f.what_struggled || null,
    key_takeaway: f.key_takeaway || null,
    next_focus: f.next_focus || null,
    post_session_notes: f.post_session_notes || null,
    score: f.score,
  }
}

function formatSampledAt(iso: string): string {
  // Backend sends naive UTC timestamps (no trailing Z). JS would read those as
  // local time, so append Z when the string has no timezone suffix.
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(iso)
  const d = new Date(hasTz ? iso : iso + 'Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function WeatherSampleRow({ sample }: { sample: PlaySessionWeatherSample }) {
  const parts: string[] = []
  if (sample.temp_f != null) parts.push(`${Math.round(sample.temp_f)}°F`)
  if (sample.wind_speed_mph != null) {
    const dir = sample.wind_dir_cardinal ? ` ${sample.wind_dir_cardinal}` : ''
    const gust = sample.wind_gust_mph ? ` (gusts ${Math.round(sample.wind_gust_mph)})` : ''
    parts.push(`Wind ${Math.round(sample.wind_speed_mph)}mph${dir}${gust}`)
  }
  if (sample.humidity_pct != null) parts.push(`${Math.round(sample.humidity_pct)}% humidity`)
  if (sample.precipitation_in != null && sample.precipitation_in > 0) {
    parts.push(`${sample.precipitation_in.toFixed(2)}" precip`)
  }
  return (
    <div className={s.weatherRow}>
      <div className={s.weatherDesc}>
        {sample.weather_desc || '—'}
        {sample.hole_number ? ` · Hole ${sample.hole_number}` : ''}
      </div>
      <div className={s.weatherMeta}>
        <span>{formatSampledAt(sample.sampled_at)}</span>
        {parts.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
    </div>
  )
}

export function PlaySessionPage() {
  const { id } = useParams<{ id: string }>()
  const sessionId = id ? Number(id) : undefined
  const navigate = useNavigate()
  const { confirm } = useConfirm()
  const { data, isLoading } = usePlaySession(sessionId)
  const updateMutation = useUpdatePlaySession(sessionId ?? 0)
  const deleteMutation = useDeletePlaySession()
  const sampleMutation = useSampleWeather(sessionId ?? 0)

  const [fields, setFields] = useState<LocalFields | null>(null)
  const [saveStatus, setSaveStatus] = useState<string>('')
  const [sampleError, setSampleError] = useState<string>('')

  // Track the last snapshot synced from the server so auto-save doesn't fire on load.
  const lastSyncedRef = useRef<string>('')
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (data) {
      const next = fromDetail(data)
      setFields(next)
      lastSyncedRef.current = JSON.stringify(next)
    }
  }, [data])

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

  const handleStartPlaying = async () => {
    await flushPending()
    await updateMutation.mutateAsync({ state: 'ACTIVE' })
    goToMap()
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

  const handleSample = async () => {
    setSampleError('')
    try {
      await sampleMutation.mutateAsync(undefined)
    } catch (e) {
      setSampleError((e as Error).message)
    }
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
            <RatingRow
              label="Energy"
              value={fields.energy_rating}
              onChange={(v) => update('energy_rating', v)}
              disabled={isFrozen}
            />
            <RatingRow
              label="Focus"
              value={fields.focus_rating}
              onChange={(v) => update('focus_rating', v)}
              disabled={isFrozen}
            />
            <RatingRow
              label="Physical"
              value={fields.physical_rating}
              onChange={(v) => update('physical_rating', v)}
              disabled={isFrozen}
            />
            <FormGroup label="Goals for today">
              <textarea
                className={s.textarea}
                value={fields.session_goals}
                onChange={(e) => update('session_goals', e.target.value)}
                placeholder="What are you working on?"
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="Clubs focused">
              <Input
                value={fields.clubs_focused}
                onChange={(e) => update('clubs_focused', e.target.value)}
                placeholder="Driver, 7i, wedges…"
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="Pre-round notes">
              <textarea
                className={s.textarea}
                value={fields.pre_session_notes}
                onChange={(e) => update('pre_session_notes', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Weather"
          action={
            !isFrozen ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSample}
                disabled={sampleMutation.isPending}
              >
                <CloudSun size={14} />{' '}
                {sampleMutation.isPending ? 'Sampling…' : 'Sample now'}
              </Button>
            ) : undefined
          }
        />
        <div className={s.cardBody}>
          {sampleError && <p className={s.sampleError}>{sampleError}</p>}
          {data.weather_samples.length === 0 ? (
            <div className={s.saveStatus}>No samples yet.</div>
          ) : (
            <div className={s.weatherList}>
              {data.weather_samples.map((w) => (
                <WeatherSampleRow key={w.id} sample={w} />
              ))}
            </div>
          )}
        </div>
      </Card>

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
              max={10}
              disabled={isFrozen}
            />
            <FormGroup label="What worked">
              <textarea
                className={s.textarea}
                value={fields.what_worked}
                onChange={(e) => update('what_worked', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="What struggled">
              <textarea
                className={s.textarea}
                value={fields.what_struggled}
                onChange={(e) => update('what_struggled', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="Key takeaway">
              <textarea
                className={s.textarea}
                value={fields.key_takeaway}
                onChange={(e) => update('key_takeaway', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="Next focus">
              <textarea
                className={s.textarea}
                value={fields.next_focus}
                onChange={(e) => update('next_focus', e.target.value)}
                disabled={isFrozen}
              />
            </FormGroup>
            <FormGroup label="Post-round notes">
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
          <Button variant="primary" onClick={handleStartPlaying}>
            <MapIcon size={14} /> Start Playing
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
