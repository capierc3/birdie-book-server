import { useState, useCallback } from 'react'
import { DropZone, Button, useToast } from '../../components'
import { useImportCsvText, useImportCsvFile } from '../../api'
import styles from './import.module.css'

const CSV_EXAMPLE = `Club,Carry,Total,Ball Speed,Height,Launch Ang.,Launch Dir.,Carry Side,From Pin
Driver,230,245,165,95,12.5,1.2R,5L,15.3
7 Iron,160,168,120,78,18.2,0.5R,2L,8.5`

interface CsvRangeImportProps {
  sessionDate: string
  title: string
  notes: string
}

export function CsvRangeImport({ sessionDate, title, notes }: CsvRangeImportProps) {
  const { toast } = useToast()
  const importCsvText = useImportCsvText()
  const importCsvFile = useImportCsvFile()

  const [csvText, setCsvText] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const busy = importCsvText.isPending || importCsvFile.isPending

  const reset = useCallback(() => {
    setCsvText('')
    setCsvFile(null)
    setError('')
  }, [])

  const handleFiles = (files: File[]) => {
    const f = files[0]
    if (f) {
      setCsvFile(f)
      setCsvText('')
    }
  }

  const handleSubmit = async () => {
    setError('')
    const dateStr = sessionDate || undefined
    const titleStr = title || undefined
    const notesStr = notes || undefined

    try {
      if (csvFile) {
        const result = await importCsvFile.mutateAsync({
          file: csvFile,
          title: titleStr,
          sessionDate: dateStr,
          notes: notesStr,
        })
        toast(`Imported ${result.shot_count} shots`, 'success')
      } else if (csvText.trim()) {
        const result = await importCsvText.mutateAsync({
          csv_text: csvText,
          title: titleStr,
          session_date: dateStr,
          notes: notesStr,
        })
        toast(`Imported ${result.shot_count} shots`, 'success')
      } else {
        setError('Paste CSV text or upload a file')
        return
      }
      reset()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed'
      setError(msg)
    }
  }

  return (
    <div>
      <div style={{ marginTop: 12 }}>
        <DropZone
          accept=".csv"
          onFiles={handleFiles}
          label={csvFile ? csvFile.name : 'Drop a CSV file here or browse'}
          sublabel=".csv files only"
        />

        <div style={{ margin: '12px 0 4px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          — or paste CSV text below —
        </div>

        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value)
            setCsvFile(null)
          }}
          placeholder={CSV_EXAMPLE}
          rows={6}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--bg-input, var(--bg))',
            color: 'var(--text)',
            fontSize: '0.82rem',
            fontFamily: 'monospace',
            resize: 'vertical',
          }}
        />

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
          Expected format: <strong>Club</strong>, Carry, Total, Ball Speed, Height, Launch Ang., Launch Dir., Carry Side, From Pin
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger, #ef4444)', fontSize: '0.84rem', marginTop: 12 }}>{error}</div>}

      <div className={styles.actions}>
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? 'Importing...' : 'Import CSV'}
        </Button>
      </div>
    </div>
  )
}
