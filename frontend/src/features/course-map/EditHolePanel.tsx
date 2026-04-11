import { useState, useCallback } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useConfirm } from '../../components'
import { useCourseMap, getHoleCompleteness, DATA_SOURCE_COLORS } from './courseMapState'
import { put, post, del } from '../../api'
import s from './panels.module.css'

export function EditHolePanel({ onClose }: { onClose: () => void }) {
  const { confirm, alert } = useConfirm()
  const ctx = useCourseMap()
  const { course, currentHole, teeId } = ctx
  const totalHoles = course?.holes ?? 18

  const tee = course?.tees?.find((t) => t.id === teeId) ?? course?.tees?.[0]
  const hole = tee?.holes?.find((h) => h.hole_number === currentHole)

  // Local form state
  const [par, setPar] = useState(hole?.par?.toString() ?? '')
  const [yardage, setYardage] = useState(hole?.yardage?.toString() ?? '')
  const [handicap, setHandicap] = useState(hole?.handicap?.toString() ?? '')

  // Sync form when hole changes
  const prevHoleRef = useState({ hole: currentHole, tee: teeId })[0]
  if (prevHoleRef.hole !== currentHole || prevHoleRef.tee !== teeId) {
    prevHoleRef.hole = currentHole
    prevHoleRef.tee = teeId
    const h = tee?.holes?.find((x) => x.hole_number === currentHole)
    setPar(h?.par?.toString() ?? '')
    setYardage(h?.yardage?.toString() ?? '')
    setHandicap(h?.handicap?.toString() ?? '')
  }

  // Mark dirty on form change
  const handleParChange = (v: string) => { setPar(v); ctx.setDirty(true) }
  const handleYardageChange = (v: string) => { setYardage(v); ctx.setDirty(true) }
  const handleHandicapChange = (v: string) => { setHandicap(v); ctx.setDirty(true) }

  // Tee management
  const handleAddTee = useCallback(async () => {
    const name = prompt('New tee name (e.g. "Blue", "Gold"):')
    if (!name?.trim() || !course) return
    await post(`/courses/${course.id}/tees`, { tee_name: name.trim() })
    await ctx.reloadCourse()
  }, [course, ctx])

  const handleDeleteTee = useCallback(async (deleteTeeId: number, teeName: string) => {
    const ok = await confirm({
      title: 'Delete Tee',
      message: `Delete tee "${teeName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    if (!course) return
    try {
      await del(`/courses/${course.id}/tees/${deleteTeeId}`)
      await ctx.reloadCourse()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to delete tee'
      await alert(msg, 'Error')
    }
  }, [course, ctx, confirm, alert])

  const handleTeeFieldChange = useCallback(async (fieldTeeId: number, field: string, value: string) => {
    if (!course) return
    const parsed = field === 'tee_name' ? value : (value ? parseFloat(value) : null)
    await put(`/courses/${course.id}/tees/${fieldTeeId}`, { [field]: parsed })
    await ctx.reloadCourse()
  }, [course, ctx])

  // Expose form values for save (via context)
  // The save function reads from context + these are synced on blur
  const handleFormBlur = useCallback(() => {
    // This just ensures dirty flag is set; actual save is via toolbar button
  }, [])

  // Sync form values to context for save access
  ctx._formValues.par = par
  ctx._formValues.yardage = yardage
  ctx._formValues.handicap = handicap

  return (
    <FloatingPanel title={`Edit Hole ${currentHole}`} onClose={onClose} width={320}>
      {/* Hole nav grid */}
      <div className={s.holeNavGrid}>
        {Array.from({ length: totalHoles }, (_, i) => i + 1).map((n) => {
          const comp = course ? getHoleCompleteness(course, n, teeId) : 0
          const cls = n === currentHole ? s.holeNavActive
            : comp >= 5 ? s.holeNavComplete
            : comp >= 2 ? s.holeNavPartial
            : s.holeNavEmpty
          return (
            <button
              key={n}
              className={`${s.holeNavBtn} ${cls}`}
              onClick={() => ctx.selectHole(n)}
            >
              {n}
            </button>
          )
        })}
      </div>

      {/* Hole info form */}
      <div className={s.section}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>Hole {currentHole}</h4>
        <div className={s.fieldRow}>
          <label className={s.fieldLabel}>
            Par
            <input type="number" min={3} max={6} value={par} onChange={(e) => handleParChange(e.target.value)} onBlur={handleFormBlur} className={s.fieldInput} />
          </label>
          <label className={s.fieldLabel}>
            Yds
            <input type="number" min={0} max={700} value={yardage} onChange={(e) => handleYardageChange(e.target.value)} onBlur={handleFormBlur} className={s.fieldInput} />
          </label>
          <label className={s.fieldLabel}>
            HCP
            <input type="number" min={1} max={18} value={handicap} onChange={(e) => handleHandicapChange(e.target.value)} onBlur={handleFormBlur} className={s.fieldInput} />
          </label>
        </div>

        {/* Data source badge */}
        {hole?.data_source && (
          <div className={s.dataSource}>
            Source: <span style={{ color: DATA_SOURCE_COLORS[hole.data_source] || '#9e9e9e' }}>{hole.data_source}</span>
          </div>
        )}

        {/* Completeness tags */}
        <div className={s.completeness}>
          {[
            { label: 'Par', present: !!par },
            { label: 'Yardage', present: !!yardage },
            { label: 'Tee GPS', present: !!ctx.teePos },
            { label: 'Green GPS', present: !!ctx.greenPos },
            { label: 'FW Path', present: ctx.fairwayPath.length >= 2 },
            { label: 'Green Bnd', present: ctx.greenBoundary.length >= 3 },
          ].map((c) => (
            <span key={c.label} className={c.present ? s.tagPresent : s.tagMissing}>{c.label}</span>
          ))}
        </div>
      </div>

      {/* Tee selector */}
      <div className={s.section}>
        <label className={s.sectionLabel}>Editing Tee:</label>
        <select
          className={s.fieldInput}
          style={{ width: '100%' }}
          value={teeId ?? ''}
          onChange={(e) => ctx.setTeeId(Number(e.target.value))}
        >
          {(course?.tees || []).map((t) => (
            <option key={t.id} value={t.id}>{t.tee_name}</option>
          ))}
        </select>
      </div>

      {/* Manage Tees */}
      <div className={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className={s.sectionLabel}>Manage Tees</span>
          <button className={s.ghostBtn} onClick={handleAddTee}>+ Add Tee</button>
        </div>
        {(course?.tees || []).map((t) => (
          <div key={t.id} className={s.teeItem}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <input
                type="text"
                className={s.fieldInput}
                style={{ flex: 1, fontWeight: 600 }}
                defaultValue={t.tee_name}
                onBlur={(e) => handleTeeFieldChange(t.id, 'tee_name', e.target.value)}
              />
              <button className={s.deleteBtn} onClick={() => handleDeleteTee(t.id, t.tee_name)}>&times;</button>
            </div>
            <div className={s.teeFields}>
              <label className={s.teeFieldLabel}>
                Yards
                <input type="number" className={s.fieldInput} defaultValue={t.total_yards ?? ''} onBlur={(e) => handleTeeFieldChange(t.id, 'total_yards', e.target.value)} />
              </label>
              <label className={s.teeFieldLabel}>
                Par
                <input type="number" className={s.fieldInput} defaultValue={t.par_total ?? ''} onBlur={(e) => handleTeeFieldChange(t.id, 'par_total', e.target.value)} />
              </label>
              <label className={s.teeFieldLabel}>
                Rating
                <input type="number" step="0.1" className={s.fieldInput} defaultValue={t.course_rating ?? ''} onBlur={(e) => handleTeeFieldChange(t.id, 'course_rating', e.target.value)} />
              </label>
              <label className={s.teeFieldLabel}>
                Slope
                <input type="number" className={s.fieldInput} defaultValue={t.slope_rating ?? ''} onBlur={(e) => handleTeeFieldChange(t.id, 'slope_rating', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </FloatingPanel>
  )
}
