import { useState, useEffect, useCallback } from 'react'
import { useMobileMap } from '../MobileMapContext'
import s from './tabs.module.css'

const QUICK_TAGS = [
  'Great Drive', 'Missed FW L', 'Missed FW R', 'GIR', 'Up & Down', '3-Putt', 'Penalty', 'Sand Save',
]

interface HoleNote {
  score: number | null
  tags: string[]
  text: string
}

function getStorageKey(courseId: number | undefined, holeNum: number) {
  return `birdie_book_notes_${courseId}_h${holeNum}`
}

function loadNote(courseId: number | undefined, holeNum: number): HoleNote {
  try {
    const raw = localStorage.getItem(getStorageKey(courseId, holeNum))
    if (raw) return JSON.parse(raw)
  } catch {}
  return { score: null, tags: [], text: '' }
}

function saveNote(courseId: number | undefined, holeNum: number, note: HoleNote) {
  localStorage.setItem(getStorageKey(courseId, holeNum), JSON.stringify(note))
}

export function NotesTab() {
  const { courseId, currentHole, totalHoles, formValues } = useMobileMap()
  const par = parseInt(formValues.par) || 4

  const [note, setNote] = useState<HoleNote>(() => loadNote(courseId, currentHole))

  // Reload when hole changes
  useEffect(() => {
    setNote(loadNote(courseId, currentHole))
  }, [courseId, currentHole])

  // Auto-save on change
  useEffect(() => {
    saveNote(courseId, currentHole, note)
  }, [courseId, currentHole, note])

  const setScore = useCallback((val: number | null) => {
    setNote(prev => ({ ...prev, score: val }))
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setNote(prev => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag],
    }))
  }, [])

  const setText = useCallback((text: string) => {
    setNote(prev => ({ ...prev, text }))
  }, [])

  // Running scorecard across all holes
  const scorecardItems = []
  let cumulative = 0
  for (let h = 1; h <= totalHoles; h++) {
    const hn = loadNote(courseId, h)
    const holePar = h === currentHole ? par : 4 // simplified; could load per-hole par
    scorecardItems.push({ hole: h, score: hn.score, par: holePar })
    if (hn.score != null) cumulative += hn.score - holePar
  }

  return (
    <div>
      {/* Running scorecard */}
      <div className={s.section}>
        <div className={s.sectionTitle}>
          Scorecard
          <span className={s.cumulativeScore} style={{ color: cumulative === 0 ? 'var(--text)' : cumulative > 0 ? 'var(--danger)' : 'var(--accent)' }}>
            {cumulative === 0 ? 'E' : cumulative > 0 ? `+${cumulative}` : cumulative}
          </span>
        </div>
        <div className={s.scorecardStrip}>
          {scorecardItems.map(item => (
            <div
              key={item.hole}
              className={`${s.scorecardCell} ${item.hole === currentHole ? s.scorecardActive : ''}`}
            >
              <span className={s.scorecardHole}>{item.hole}</span>
              <span className={s.scorecardScore} style={{
                color: item.score == null ? 'var(--text-dim)' :
                  item.score < item.par ? 'var(--accent)' :
                  item.score === item.par ? 'var(--text)' :
                  item.score === item.par + 1 ? 'var(--bogey)' :
                  'var(--double)',
              }}>
                {item.score ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Current hole score */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Hole {currentHole} Score</div>
        <div className={s.scoreInput}>
          <button className={s.scoreStepper} onClick={() => setScore(Math.max(1, (note.score ?? par) - 1))}>−</button>
          <span className={s.scoreDisplay}>{note.score ?? '—'}</span>
          <button className={s.scoreStepper} onClick={() => setScore((note.score ?? par) + 1)}>+</button>
          {note.score != null && (
            <button className={s.ghostBtn} onClick={() => setScore(null)}>Clear</button>
          )}
        </div>
      </div>

      {/* Quick tags */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Quick Tags</div>
        <div className={s.tagGrid}>
          {QUICK_TAGS.map(tag => (
            <button
              key={tag}
              className={`${s.tagBtn} ${note.tags.includes(tag) ? s.tagActive : ''}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Free text */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Notes</div>
        <textarea
          className={s.noteTextarea}
          placeholder="Add a note for this hole..."
          value={note.text}
          onChange={e => setText(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  )
}
