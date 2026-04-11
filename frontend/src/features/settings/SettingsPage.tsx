import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, Button, Select, useToast, useConfirm } from '../../components'
import { post } from '../../api/client'
import styles from './SettingsPage.module.css'

const TEE_OPTIONS = [
  { value: '', label: 'Auto (first available)' },
  { value: 'Black', label: 'Black' },
  { value: 'Blue', label: 'Blue' },
  { value: 'Gold', label: 'Gold' },
  { value: 'White', label: 'White' },
  { value: 'Green', label: 'Green' },
  { value: 'Red', label: 'Red' },
]

const STORAGE_KEY = 'birdie_book_default_tee'

export function SettingsPage() {
  const [defaultTee, setDefaultTee] = useState(
    () => localStorage.getItem(STORAGE_KEY) || '',
  )
  const [clearing, setClearing] = useState(false)
  const [rebuilding, setRebuilding] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const handleTeeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setDefaultTee(value)
    localStorage.setItem(STORAGE_KEY, value)
  }, [])

  const handleClearData = useCallback(async () => {
    const ok1 = await confirm({
      title: 'Clear All Data',
      message: 'Are you sure you want to clear ALL data? This cannot be undone.',
      confirmLabel: 'Continue',
    })
    if (!ok1) return
    const ok2 = await confirm({
      title: 'Are You Sure?',
      message: 'This will delete all rounds, courses, clubs, range sessions, and shots. Are you absolutely sure?',
      confirmLabel: 'Clear Everything',
    })
    if (!ok2) return

    setClearing(true)
    try {
      await post('/settings/clear-data')
      toast('All data cleared successfully.')
      queryClient.invalidateQueries()
    } catch (e) {
      toast('Failed to clear data: ' + (e as Error).message, 'error')
    } finally {
      setClearing(false)
    }
  }, [queryClient, toast, confirm])

  const handleRebuildBaseline = useCallback(async () => {
    setRebuilding(true)
    try {
      const data = await post<{
        shot_count: number
        bucket_count: number
        shots_updated: number
      }>('/settings/rebuild-personal-baseline')
      toast(
        `Baseline rebuilt: ${data.shot_count} shots, ${data.bucket_count} buckets, ${data.shots_updated} shots updated.`,
      )
    } catch (e) {
      toast('Failed to rebuild baseline: ' + (e as Error).message, 'error')
    } finally {
      setRebuilding(false)
    }
  }, [toast])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>Application configuration</p>
      </div>

      <div className={styles.section}>
        <Card>
          <CardHeader title="Preferences" />
          <div>
            <label className={styles.fieldLabel}>Default Tee</label>
            <Select
              className={styles.teeSelect}
              value={defaultTee}
              onChange={handleTeeChange}
            >
              {TEE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <p className={styles.fieldHelp}>
              Sets the default tee when opening the course editor. Matches by tee color name.
            </p>
          </div>
        </Card>
      </div>

      <div className={styles.section}>
        <Card>
          <CardHeader title="Data Management" />
          <p className={styles.actionDesc}>
            Clear all data and start fresh. This will delete all rounds, courses, clubs, range
            sessions, and shots.
          </p>
          <Button
            size="sm"
            className={styles.dangerBtn}
            onClick={handleClearData}
            disabled={clearing}
          >
            {clearing ? 'Clearing\u2026' : 'Clear All Data'}
          </Button>

          <div className={styles.divider}>
            <p className={styles.actionDesc}>
              Rebuild your personal strokes gained baseline from all course round data. This
              recalculates expected strokes at each distance/lie based on your own history.
            </p>
            <Button size="sm" onClick={handleRebuildBaseline} disabled={rebuilding}>
              {rebuilding ? 'Rebuilding\u2026' : 'Rebuild Personal Baseline'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
