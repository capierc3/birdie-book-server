import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DropZone, Button, ProgressBar, useToast } from '../../components'
import styles from './import.module.css'

export function RapsodoImport() {
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleFiles = useCallback(
    async (files: File[]) => {
      const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'))
      if (csvFiles.length === 0) {
        toast('Please select CSV files', 'error')
        return
      }

      setImporting(true)
      setProgress(0)

      let totalShots = 0
      let totalCreated = 0
      let totalRelinked = 0
      let imported = 0
      let duplicates = 0
      let errors = 0

      for (let i = 0; i < csvFiles.length; i++) {
        setProgress(((i + 1) / csvFiles.length) * 100)
        setProgressLabel(`Importing file ${i + 1} of ${csvFiles.length}...`)

        const formData = new FormData()
        formData.append('file', csvFiles[i])

        try {
          const resp = await fetch('/api/range/import/rapsodo', { method: 'POST', body: formData })
          const data = await resp.json()

          if (!resp.ok) {
            errors++
            continue
          }

          if (data.status === 'duplicate') {
            duplicates++
          } else {
            imported++
            totalShots += data.shot_count || 0
            totalCreated += data.clubs_created || 0
            totalRelinked += data.relinked || 0
          }
        } catch {
          errors++
        }
      }

      const parts: string[] = []
      if (imported > 0) parts.push(`${imported} session(s) imported (${totalShots} shots)`)
      if (duplicates > 0) parts.push(`${duplicates} duplicate(s) skipped`)
      if (errors > 0) parts.push(`${errors} error(s)`)
      if (totalCreated > 0) parts.push(`${totalCreated} club(s) created`)
      if (totalRelinked > 0) parts.push(`${totalRelinked} shot(s) re-linked`)

      toast(parts.join('. ') + '.', errors > 0 && imported === 0 ? 'error' : 'success')

      if (imported > 0) {
        queryClient.invalidateQueries({ queryKey: ['range'] })
        queryClient.invalidateQueries({ queryKey: ['clubs'] })
      }

      setImporting(false)
      setProgress(0)
      setProgressLabel('')
    },
    [queryClient, toast],
  )

  return (
    <div>
      <h2 className={styles.sectionTitle}>Rapsodo MLM2PRO</h2>
      <p className={styles.sectionDesc}>
        Drop your exported CSV files to import range session data.
      </p>

      <DropZone
        accept=".csv"
        multiple
        onFiles={handleFiles}
        disabled={importing}
        label="Drop CSV files here or browse"
        sublabel="Multiple files supported"
      />

      {importing && (
        <div className={styles.progressWrap}>
          <ProgressBar value={progress} />
          <div className={styles.progressLabel}>{progressLabel}</div>
        </div>
      )}
    </div>
  )
}
