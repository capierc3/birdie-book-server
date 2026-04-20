import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMobileMap } from './MobileMapContext'
import s from './HoleInfoBar.module.css'

export function HoleInfoBar() {
  const ctx = useMobileMap()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')
  const { course, courseId, currentHole, totalHoles, teeId, formValues, prevHole, nextHole, selectHole } = ctx
  const [holeMenuOpen, setHoleMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const par = formValues.par || '—'
  const yardage = formValues.yardage || '—'

  const holeOptions = Array.from({ length: totalHoles }, (_, i) => i + 1)

  useEffect(() => {
    if (!holeMenuOpen) return
    const handleTap = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setHoleMenuOpen(false)
    }
    document.addEventListener('mousedown', handleTap)
    document.addEventListener('touchstart', handleTap)
    return () => { document.removeEventListener('mousedown', handleTap); document.removeEventListener('touchstart', handleTap) }
  }, [holeMenuOpen])

  return (
    <div className={s.bar}>
      <button className={s.backBtn} onClick={() => navigate(courseId ? `/courses/${courseId}` : '/courses')}>
        <img src="/logo-icon.png" alt="Birdie Book" width={20} height={20} className={s.brandIcon} />
      </button>
      <div className={s.info}>
        <div className={s.holePickerWrap} ref={menuRef}>
          <button className={s.holePickerBtn} onClick={() => setHoleMenuOpen(v => !v)}>
            Hole {currentHole}
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={s.holePickerArrow}>
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {holeMenuOpen && (
            <div className={s.holeMenu}>
              {holeOptions.map(h => (
                <button
                  key={h}
                  className={`${s.holeMenuItem} ${h === currentHole ? s.holeMenuItemActive : ''}`}
                  onClick={() => { selectHole(h); setHoleMenuOpen(false) }}
                >
                  Hole {h}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className={s.sep}>·</span>
        <span className={s.detail}>Par {par}</span>
        <span className={s.sep}>·</span>
        <span className={s.detail}>{yardage} yds</span>
      </div>
      {course?.tees && course.tees.length > 1 && (
        <select
          className={s.teeSelect}
          value={teeId ?? ''}
          onChange={e => ctx.setTeeId(Number(e.target.value))}
        >
          {course.tees.map(t => (
            <option key={t.id} value={t.id}>{t.tee_name}</option>
          ))}
        </select>
      )}
      <div className={s.navBtns}>
        <button className={s.navBtn} onClick={prevHole}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <button className={s.navBtn} onClick={nextHole}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
      {sessionId && (
        <button
          className={s.endRoundBtn}
          onClick={() => navigate(`/play/sessions/${sessionId}`)}
          title="End round and go to post-round notes"
        >
          End Round
        </button>
      )}
    </div>
  )
}
