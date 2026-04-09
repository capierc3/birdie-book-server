import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, useToast } from '../../components'
import { post } from '../../api/client'
import styles from './import.module.css'

interface TrackmanResult {
  status: string
  shot_count?: number
  clubs?: string[]
  message?: string
}

export function TrackmanImport() {
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleImport = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) return

    setImporting(true)

    try {
      const data = await post<TrackmanResult>('/range/import/trackman', { url: trimmed })

      if (data.status === 'duplicate') {
        toast(data.message || 'This report was already imported.', 'error')
      } else {
        toast(
          `Imported ${data.shot_count} shots from Trackman (${data.clubs?.join(', ')})`,
        )
        setUrl('')
        queryClient.invalidateQueries({ queryKey: ['range'] })
        queryClient.invalidateQueries({ queryKey: ['clubs'] })
      }
    } catch (e) {
      toast('Import error: ' + (e as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }, [url, queryClient, toast])

  return (
    <div>
      <h2 className={styles.sectionTitle}>Trackman Report</h2>
      <p className={styles.sectionDesc}>
        Paste a Trackman performance report URL to import your range session data.
      </p>

      <div className={styles.urlRow}>
        <Input
          className={styles.urlInput}
          placeholder="https://my.trackmanrange.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          disabled={importing}
        />
        <Button onClick={handleImport} disabled={importing || !url.trim()}>
          {importing ? 'Importing\u2026' : 'Import'}
        </Button>
      </div>
    </div>
  )
}
