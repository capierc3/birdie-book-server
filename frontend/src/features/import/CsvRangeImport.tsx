import { useState, useCallback } from 'react'
import { DropZone, Button, Input, FormGroup, useToast } from '../../components'
import { useImportCsvText, useImportCsvFile } from '../../api'
import styles from './import.module.css'

const CSV_EXAMPLE = `Club,Carry,Total,Ball Speed,Height,Launch Angle,Launch Dir.,Carry Side,From Pin
Driver,230,245,165,95,12.5,1.2R,5L,15.3
Driver,225,240,162,90,13.1,0.8L,3R,12.1
7 Iron,160,168,120,78,18.2,0.5R,2L,8.5`

export function CsvRangeImport() {
  const { toast } = useToast()
  const importCsvText = useImportCsvText()
  const importCsvFile = useImportCsvFile()

  const [csvText, setCsvText] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const busy = importCsvText.isPending || importCsvFile.isPending

  const reset = useCallback(() => {
    setCsvText('')
    setCsvFile(null)
    setTitle('')
    setSessionDate(new Date().toISOString().slice(0, 10))
    setNotes('')
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
      <h2 className={styles.sectionTitle}>CSV Range Import</h2>
      <p className={styles.sectionDesc}>
        Import range session shot data from a CSV file or pasted text.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
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
          rows={8}
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
          Required columns: <strong>Club</strong> + <strong>Carry</strong> or <strong>Total</strong>. Optional: Ball
          Speed, Height, Launch Angle, Launch Dir., Carry Side, From Pin, Spin Rate, Club Speed.
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
