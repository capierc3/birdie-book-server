import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { usePlaySessions } from '../../api'
import type { PlaySessionSummary, PlaySessionState } from '../../api'
import { Button, MobileCardList } from '../../components'
import s from './PlayPage.module.css'

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

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PlayPage() {
  const navigate = useNavigate()
  const inProgress = usePlaySessions({ state: 'PRE,ACTIVE' })
  const recent = usePlaySessions({ state: 'COMPLETE,ABANDONED' })

  const openSession = (session: PlaySessionSummary) => {
    if (session.state === 'ACTIVE' && session.course_id != null) {
      const params = new URLSearchParams({ mode: 'play' })
      if (session.tee_id != null) params.set('tee', String(session.tee_id))
      params.set('session', String(session.id))
      navigate(`/courses/${session.course_id}/map?${params.toString()}`)
      return
    }
    navigate(`/play/sessions/${session.id}`)
  }

  const renderCard = (session: PlaySessionSummary) => (
    <div className={s.sessionCard}>
      <div className={s.cardRow}>
        <span className={s.courseName}>{session.course_name || 'Unknown course'}</span>
        <span className={`${s.stateBadge} ${STATE_CLASS[session.state]}`}>
          {STATE_LABEL[session.state]}
        </span>
      </div>
      <div className={s.meta}>
        <span>{formatDate(session.date)}</span>
        {session.tee_name && <span>{session.tee_name}</span>}
        {session.holes_played && <span>{session.holes_played} holes</span>}
        {session.score != null && <span>Score {session.score}</span>}
      </div>
    </div>
  )

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Play</h1>
        <Button
          variant="primary"
          onClick={() => navigate('/play/new')}
          className={s.newBtn}
        >
          <Plus size={16} /> New Round
        </Button>
      </div>

      <div className={s.sectionTitle}>In Progress</div>
      {inProgress.isLoading ? (
        <div className={s.empty}>Loading…</div>
      ) : (
        <MobileCardList
          data={inProgress.data ?? []}
          keyExtractor={(row) => row.id}
          renderCard={renderCard}
          onCardClick={openSession}
          emptyMessage="No rounds in progress. Tap New Round to start one."
        />
      )}

      <div className={s.sectionTitle}>Recent</div>
      {recent.isLoading ? (
        <div className={s.empty}>Loading…</div>
      ) : (
        <MobileCardList
          data={(recent.data ?? []).slice(0, 10)}
          keyExtractor={(row) => row.id}
          renderCard={renderCard}
          onCardClick={openSession}
          emptyMessage="No completed rounds yet."
        />
      )}
    </div>
  )
}
