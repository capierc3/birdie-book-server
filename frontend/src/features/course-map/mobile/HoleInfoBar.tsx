import { useNavigate } from 'react-router-dom'
import { CircleDot } from 'lucide-react'
import { useMobileMap } from './MobileMapContext'
import s from './HoleInfoBar.module.css'

export function HoleInfoBar() {
  const ctx = useMobileMap()
  const navigate = useNavigate()
  const { course, courseId, currentHole, teeId, formValues } = ctx

  const par = formValues.par || '—'
  const yardage = formValues.yardage || '—'

  return (
    <div className={s.bar}>
      <button className={s.backBtn} onClick={() => navigate(courseId ? `/courses/${courseId}` : '/courses')}>
        <CircleDot size={20} className={s.brandIcon} />
      </button>
      <div className={s.info}>
        <span className={s.holeNum}>Hole {currentHole}</span>
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
    </div>
  )
}
