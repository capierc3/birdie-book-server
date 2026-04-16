import { useMobileMap } from './MobileMapContext'
import s from './MobileHoleViewer.module.css'

export function MobileHoleNav() {
  const { prevHole, nextHole } = useMobileMap()

  return (
    <>
      <button className={`${s.holeNavBtn} ${s.holeNavLeft}`} onClick={prevHole}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button className={`${s.holeNavBtn} ${s.holeNavRight}`} onClick={nextHole}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </>
  )
}
