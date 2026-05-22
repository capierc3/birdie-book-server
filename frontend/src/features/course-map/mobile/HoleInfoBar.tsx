import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMobileMap } from './MobileMapContext'
import { useToast } from '../../../components'
import { findClosestHole } from './holeProximity'
import s from './HoleInfoBar.module.css'

// Mirror the corridor threshold used by useHoleAutoDetect. Manual locate uses
// a more lenient cap since the user explicitly asked — we'd rather guess than
// say "can't find a hole".
const MANUAL_LOCATE_MAX_YARDS = 120

export function HoleInfoBar() {
  const ctx = useMobileMap()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session')
  const { course, courseId, currentHole, totalHoles, teeId, formValues, prevHole, nextHole, selectHole, gps, playMode } = ctx
  const { toast } = useToast()
  const [holeMenuOpen, setHoleMenuOpen] = useState(false)
  const [teeMenuOpen, setTeeMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const teeMenuRef = useRef<HTMLDivElement>(null)

  const par = formValues.par || '—'
  const yardage = formValues.yardage || '—'

  const holeOptions = Array.from({ length: totalHoles }, (_, i) => i + 1)
  const activeTee = course?.tees?.find(t => t.id === teeId)

  const handleLocate = useCallback(() => {
    if (!course) return
    if (gps.lat == null || gps.lng == null) {
      toast('No GPS fix yet', 'error')
      return
    }
    const closest = findClosestHole(course, teeId, { lat: gps.lat, lng: gps.lng }, totalHoles)
    if (!closest) {
      toast('No holes have GPS data yet', 'info')
      return
    }
    if (closest.yardsFromCorridor > MANUAL_LOCATE_MAX_YARDS) {
      toast(`Closest hole is ${Math.round(closest.yardsFromCorridor)}y away — too far`, 'info')
      return
    }
    if (closest.holeNum === currentHole) {
      toast(`Already on Hole ${currentHole}`, 'info')
      return
    }
    selectHole(closest.holeNum)
    toast(`Switched to Hole ${closest.holeNum}`, 'success')
  }, [course, teeId, totalHoles, currentHole, gps.lat, gps.lng, selectHole, toast])

  useEffect(() => {
    if (!holeMenuOpen) return
    const handleTap = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setHoleMenuOpen(false)
    }
    document.addEventListener('mousedown', handleTap)
    document.addEventListener('touchstart', handleTap)
    return () => { document.removeEventListener('mousedown', handleTap); document.removeEventListener('touchstart', handleTap) }
  }, [holeMenuOpen])

  useEffect(() => {
    if (!teeMenuOpen) return
    const handleTap = (e: MouseEvent | TouchEvent) => {
      if (teeMenuRef.current && !teeMenuRef.current.contains(e.target as Node)) setTeeMenuOpen(false)
    }
    document.addEventListener('mousedown', handleTap)
    document.addEventListener('touchstart', handleTap)
    return () => { document.removeEventListener('mousedown', handleTap); document.removeEventListener('touchstart', handleTap) }
  }, [teeMenuOpen])

  return (
    <div className={s.bar}>
      <button className={s.backBtn} onClick={() => navigate(courseId ? `/courses/${courseId}` : '/courses')}>
        <img src="/logo-icon.png" alt="Birdie Book" width={20} height={20} className={s.brandIcon} />
      </button>
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
      <div className={s.info}>
        <span className={s.detail}>Par {par}</span>
        <span className={s.sep}>·</span>
        <span className={s.detail}>{yardage} yds</span>
      </div>
      {course?.tees && course.tees.length > 1 && (
        <div className={s.teePickerWrap} ref={teeMenuRef}>
          <button className={s.teePickerBtn} onClick={() => setTeeMenuOpen(v => !v)}>
            <span className={s.teePickerLabel}>{activeTee?.tee_name ?? 'Tee'}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className={s.holePickerArrow}>
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {teeMenuOpen && (
            <div className={s.teeMenu}>
              {course.tees.map(t => (
                <button
                  key={t.id}
                  className={`${s.teeMenuItem} ${t.id === teeId ? s.teeMenuItemActive : ''}`}
                  onClick={() => { ctx.setTeeId(t.id); setTeeMenuOpen(false) }}
                >
                  {t.tee_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className={s.navBtns}>
        <button className={s.navBtn} onClick={prevHole}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {playMode && (
          <button
            className={s.navBtn}
            onClick={handleLocate}
            title="Find my hole from GPS"
            aria-label="Find my hole from GPS"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
            </svg>
          </button>
        )}
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
