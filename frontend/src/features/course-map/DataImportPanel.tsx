import { useState, useCallback } from 'react'
import { FloatingPanel } from '../../components/ui/FloatingPanel'
import { useCourseMap } from './courseMapState'
import { post } from '../../api'
import s from './panels.module.css'

export function DataImportPanel({ onClose }: { onClose: () => void }) {
  const ctx = useCourseMap()
  const { course } = ctx
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSyncApi = useCallback(async () => {
    if (!course) return
    setLoading(true)
    setStatus('Syncing tees from Golf API...')
    try {
      await post(`/courses/club/${course.golf_club_id}/sync`, {})
      await ctx.reloadCourse()
      setStatus('Tees synced successfully!')
    } catch (e) {
      setStatus('Sync failed')
    }
    setLoading(false)
  }, [course, ctx])

  const handleImportOsm = useCallback(async () => {
    if (!course) return
    setLoading(true)
    setStatus('Detecting OSM features...')
    try {
      const detected = await post<{
        bunkers?: number[]; water?: number[]; greens?: number[]; holes?: number[]
      }>(`/courses/${course.id}/detect-features`, {})

      setStatus('Importing features...')
      const result = await post<{ imported: Record<string, number> }>(`/courses/${course.id}/import-features`, detected)

      const counts = result.imported || {}
      const parts: string[] = []
      if (counts.holes) parts.push(`${counts.holes} holes`)
      if (counts.bunkers) parts.push(`${counts.bunkers} bunkers`)
      if (counts.water) parts.push(`${counts.water} water`)
      if (counts.greens) parts.push(`${counts.greens} greens`)

      setStatus(parts.length > 0 ? `Imported: ${parts.join(', ')}` : 'No new features found')
      await ctx.reloadCourse()
      ctx.selectHole(ctx.currentHole) // refresh overlays
    } catch (e) {
      setStatus('Import failed')
    }
    setLoading(false)
  }, [course, ctx])

  return (
    <FloatingPanel title="Data Import" onClose={onClose} width={260}>
      <div className={s.section}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className={s.actionBtn} onClick={handleSyncApi} disabled={loading}>
            Sync Tees (Golf API)
          </button>
          <button className={s.actionBtn} onClick={handleImportOsm} disabled={loading}>
            Import OSM Features
          </button>
        </div>
        {status && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>{status}</div>
        )}
      </div>
    </FloatingPanel>
  )
}
