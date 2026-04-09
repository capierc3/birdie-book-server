import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { DropZone, Button, ProgressBar, useToast } from '../../components'
import { cn } from '../../utils/cn'
import styles from './import.module.css'

const JSON_FILE_MAP: Record<string, string> = {
  'golf-club_types': 'club_types',
  'golf-club': 'clubs',
  'golf-course': 'courses',
  'golf-scorecard': 'scorecards',
  'golf-shot': 'shots',
}

function matchJsonField(filename: string): string | null {
  const lower = filename.toLowerCase().replace('.json', '')
  const sorted = Object.entries(JSON_FILE_MAP).sort((a, b) => b[0].length - a[0].length)
  for (const [pattern, field] of sorted) {
    if (lower.includes(pattern)) return field
  }
  return null
}

interface MatchedFile {
  file: File
  field: string | null
}

const STEP_LABELS: Record<string, string> = {
  clubs: 'Importing clubs...',
  courses: 'Importing courses...',
  scorecards: 'Importing rounds & shots...',
  tees: 'Inferring tee data...',
  finalizing: 'Finalizing...',
  done: 'Complete!',
}

export function GarminJsonImport() {
  const [matchedFiles, setMatchedFiles] = useState<MatchedFile[]>([])
  const [importing, setImporting] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleFiles = useCallback((files: File[]) => {
    const matched = files.map((file) => ({
      file,
      field: matchJsonField(file.name),
    }))
    setMatchedFiles(matched)
  }, [])

  const handleCancel = useCallback(() => {
    setMatchedFiles([])
    setProgressLabel('')
  }, [])

  const handleImport = useCallback(async () => {
    const validFiles = matchedFiles.filter((f) => f.field)
    if (validFiles.length === 0) return

    setImporting(true)
    setProgressLabel('Starting import...')

    const formData = new FormData()
    for (const { file, field } of validFiles) {
      formData.append(field!, file)
    }

    try {
      const resp = await fetch('/api/import/garmin-json', { method: 'POST', body: formData })
      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()!

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = JSON.parse(line.slice(6))

          if (payload.type === 'start') {
            const s = payload.summary
            setProgressLabel(
              `Importing ${s.scorecards} rounds, ${s.courses} courses, ${s.clubs} clubs, ${s.shots} shots...`,
            )
          } else if (payload.type === 'progress') {
            setProgressLabel(payload.detail || STEP_LABELS[payload.step] || payload.step)
          } else if (payload.type === 'complete') {
            const r = payload.results
            const s = payload.summary
            toast(
              `Imported: ${s.scorecards} rounds (${r.scorecards?.created || 0} new, ${r.scorecards?.updated || 0} updated), ${s.courses} courses, ${s.clubs} clubs, ${s.shots} shots`,
            )
            setMatchedFiles([])
            queryClient.invalidateQueries()
          } else if (payload.type === 'error') {
            toast(payload.detail || 'Import failed', 'error')
          }
        }
      }
    } catch (e) {
      toast('Import error: ' + (e as Error).message, 'error')
    } finally {
      setImporting(false)
      setProgressLabel('')
    }
  }, [matchedFiles, queryClient, toast])

  const hasValidFiles = matchedFiles.some((f) => f.field)

  return (
    <div>
      <h2 className={styles.sectionTitle}>Garmin Data Export</h2>
      <p className={styles.sectionDesc}>
        Import your full golf history from Garmin Connect. Export 5 JSON files and drop them here.
      </p>

      <DropZone
        accept=".json"
        multiple
        onFiles={handleFiles}
        disabled={importing}
        label="Drop JSON files here or browse"
        sublabel="Golf-CLUB.json, Golf-CLUB_TYPES.json, Golf-COURSE.json, Golf-SCORECARD.json, Golf-SHOT.json"
      />

      {matchedFiles.length > 0 && (
        <div className={styles.fileList}>
          {matchedFiles.map((f, i) => (
            <div
              key={i}
              className={cn(styles.fileItem, f.field ? styles.matched : styles.unrecognized)}
            >
              {f.field ? (
                <CheckCircle className={styles.fileIcon} />
              ) : (
                <AlertTriangle className={styles.fileIcon} />
              )}
              <span className={styles.fileName}>{f.file.name}</span>
              <span className={styles.fileField}>
                {f.field ? `\u2192 ${f.field}` : 'unrecognized'}
              </span>
            </div>
          ))}
        </div>
      )}

      {importing && (
        <div className={styles.progressWrap}>
          <ProgressBar value={0} className={styles.progressBar} />
          <div className={styles.progressLabel}>{progressLabel}</div>
        </div>
      )}

      {matchedFiles.length > 0 && !importing && (
        <div className={styles.actions}>
          <Button onClick={handleImport} disabled={!hasValidFiles}>
            Import All
          </Button>
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}
