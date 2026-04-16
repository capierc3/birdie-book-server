import { useMobileMap } from '../MobileMapContext'
import s from './tabs.module.css'

export function EditTab() {
  const ctx = useMobileMap()
  const { editMode, setEditMode, formValues, setFormValues, dirty, saveHole, teePos, greenPos, fairwayPath, setFairwayPath, setDirty, triggerRedraw } = ctx

  const handleParChange = (val: string) => {
    setFormValues({ ...formValues, par: val })
    setDirty(true)
  }

  const handleYardageChange = (val: string) => {
    setFormValues({ ...formValues, yardage: val })
    setDirty(true)
  }

  const clearFairway = () => {
    setFairwayPath([])
    setDirty(true)
    triggerRedraw()
  }

  const undoLastFairwayPoint = () => {
    if (fairwayPath.length > 0) {
      setFairwayPath(fairwayPath.slice(0, -1))
      setDirty(true)
      triggerRedraw()
    }
  }

  return (
    <div>
      {/* Par / Yardage */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Hole Info</div>
        <div className={s.editFieldRow}>
          <label className={s.editFieldLabel}>
            Par
            <input
              type="number"
              className={s.editFieldInput}
              value={formValues.par}
              onChange={e => handleParChange(e.target.value)}
              min={3}
              max={6}
            />
          </label>
          <label className={s.editFieldLabel}>
            Yardage
            <input
              type="number"
              className={s.editFieldInput}
              value={formValues.yardage}
              onChange={e => handleYardageChange(e.target.value)}
              min={0}
              max={700}
            />
          </label>
        </div>
      </div>

      {/* Placement tools */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Tap Map to Place</div>
        <div className={s.editToolRow}>
          <button
            className={`${s.editToolBtn} ${editMode === 'tee' ? s.editToolActive : ''}`}
            onClick={() => setEditMode(editMode === 'tee' ? null : 'tee')}
          >
            <span className={s.editToolDot} style={{ background: '#FFD700' }} />
            Place Tee
            {teePos && <span className={s.checkMark}>&#10003;</span>}
          </button>
          <button
            className={`${s.editToolBtn} ${editMode === 'green' ? s.editToolActive : ''}`}
            onClick={() => setEditMode(editMode === 'green' ? null : 'green')}
          >
            <span className={s.editToolDot} style={{ background: '#4CAF50' }} />
            Place Green
            {greenPos && <span className={s.checkMark}>&#10003;</span>}
          </button>
          <button
            className={`${s.editToolBtn} ${editMode === 'fairway' ? s.editToolActive : ''}`}
            onClick={() => setEditMode(editMode === 'fairway' ? null : 'fairway')}
          >
            <span className={s.editToolDot} style={{ background: '#FFD700' }} />
            Fairway Line
            {fairwayPath.length >= 2 && <span className={s.checkMark}>&#10003;</span>}
          </button>
        </div>

        {editMode && (
          <div className={s.editHint}>
            {editMode === 'tee' && 'Tap the map to set the tee location'}
            {editMode === 'green' && 'Tap the map to set the green/flag location'}
            {editMode === 'fairway' && 'Tap sequentially to draw the fairway centerline'}
          </div>
        )}

        {editMode === 'fairway' && fairwayPath.length > 0 && (
          <div className={s.editActions}>
            <button className={s.ghostBtn} onClick={undoLastFairwayPoint}>Undo Last</button>
            <button className={s.ghostBtn} onClick={clearFairway}>Clear All</button>
          </div>
        )}
      </div>

      {/* Save */}
      <div className={s.section}>
        <button
          className={s.primaryBtn}
          disabled={!dirty}
          onClick={saveHole}
          style={{ width: '100%' }}
        >
          Save Hole
        </button>
      </div>
    </div>
  )
}
