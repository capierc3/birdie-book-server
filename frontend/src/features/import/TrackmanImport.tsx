import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, FormGroup, useToast } from '../../components'
import { post } from '../../api/client'
import { CsvRangeImport } from './CsvRangeImport'
import { OcrImport } from './OcrImport'
import styles from './import.module.css'

interface TrackmanResult {
  status: string
  shot_count?: number
  clubs?: string[]
  message?: string
}

const HR = () => (
  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '28px 0' }} />
)

export function TrackmanImport() {
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Shared session metadata for Range CSV and Range OCR
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [rangeMode, setRangeMode] = useState<'csv' | 'ocr'>('csv')

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
      {/* Section 1: TPS Report */}
      <h2 className={styles.sectionTitle}>TPS Report (URL)</h2>
      <p className={styles.sectionDesc}>
        Paste a Trackman performance report URL to import your range session data.
      </p>

      <div className={styles.urlRow}>
        <Input
          className={styles.urlInput}
          placeholder="Trackman report URL or ID"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          disabled={importing}
        />
        <Button onClick={handleImport} disabled={importing || !url.trim()}>
          {importing ? 'Importing\u2026' : 'Import'}
        </Button>
      </div>

      <HR />

      {/* Shared session metadata for Range imports */}
      <h2 className={styles.sectionTitle}>Range Session</h2>
      <p className={styles.sectionDesc}>
        Import Trackman Range data via CSV or OCR screenshots. Session details below apply to both methods.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <FormGroup label="Date">
          <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
        </FormGroup>
        <FormGroup label="Title (optional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trackman Range Session" />
        </FormGroup>
      </div>
      <FormGroup label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes..."
          rows={2}
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg-input, var(--bg))',
            color: 'var(--text)',
            fontSize: '0.88rem',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </FormGroup>

      {/* Toggle: CSV or OCR */}
      <div style={{ display: 'flex', gap: 4, marginTop: 20, marginBottom: 16 }}>
        {(['csv', 'ocr'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setRangeMode(mode)}
            style={{
              padding: '6px 16px',
              fontSize: '0.82rem',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: rangeMode === mode ? 'var(--accent)' : 'transparent',
              color: rangeMode === mode ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {mode === 'csv' ? 'CSV' : 'OCR'}
          </button>
        ))}
      </div>

      {rangeMode === 'csv' && (
        <CsvRangeImport sessionDate={sessionDate} title={title} notes={notes} />
      )}
      {rangeMode === 'ocr' && (
        <OcrImport sessionDate={sessionDate} title={title} notes={notes} />
      )}
    </div>
  )
}
