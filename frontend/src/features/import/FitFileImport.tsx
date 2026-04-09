import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DropZone, Button, ProgressBar, useToast } from '../../components'
import { getScoreClass } from '../../utils/scoreColors'
import { cn } from '../../utils/cn'
import styles from './import.module.css'

interface HoleData {
  hole: number
  par: number
  yardage?: number
  handicap?: number
}

interface ScorecardEntry {
  hole: number
  strokes: number
  putts?: number
  fairway?: string
}

interface FitPreview {
  course: string
  date: string
  tee: string | null
  player: string
  total_strokes: number
  holes_completed: number
  course_rating: number | null
  slope_rating: number | null
  shots_tracked: number
  score_vs_par: number
  par: number
  hole_data: HoleData[]
  scorecard: ScorecardEntry[]
}

export function FitFileImport() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<FitPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleFiles = useCallback(
    async (files: File[]) => {
      const fitFile = files.find((f) => f.name.toLowerCase().endsWith('.fit'))
      if (!fitFile) {
        toast('Please select a .fit file', 'error')
        return
      }

      setFile(fitFile)
      setLoading(true)

      const formData = new FormData()
      formData.append('file', fitFile)

      try {
        const resp = await fetch('/api/import/fit/preview', { method: 'POST', body: formData })
        if (!resp.ok) {
          const err = await resp.json()
          toast(err.detail || 'Failed to parse FIT file', 'error')
          setFile(null)
          return
        }
        setPreview(await resp.json())
      } catch (e) {
        toast('Error parsing file: ' + (e as Error).message, 'error')
        setFile(null)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  const handleImport = useCallback(async () => {
    if (!file) return
    setImporting(true)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const resp = await fetch('/api/import/fit', { method: 'POST', body: formData })
      const data = await resp.json()

      if (resp.ok) {
        toast(
          `Imported: ${data.course} \u2014 ${data.date} \u2014 ${data.strokes} strokes (${data.shots_tracked} shots tracked)`,
        )
        setFile(null)
        setPreview(null)
        queryClient.invalidateQueries()
      } else {
        toast(data.detail || 'Import failed', 'error')
      }
    } catch (e) {
      toast('Import error: ' + (e as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }, [file, queryClient, toast])

  const handleCancel = useCallback(() => {
    setFile(null)
    setPreview(null)
  }, [])

  const holeMap: Record<number, HoleData> = {}
  preview?.hole_data.forEach((h) => {
    holeMap[h.hole] = h
  })

  const front9 = preview?.scorecard.filter((s) => s.hole <= 9) || []
  const back9 = preview?.scorecard.filter((s) => s.hole > 9) || []
  const frontTotal = front9.reduce((sum, s) => sum + s.strokes, 0)
  const backTotal = back9.reduce((sum, s) => sum + s.strokes, 0)

  const vsParStr =
    preview && preview.score_vs_par > 0
      ? `+${preview.score_vs_par}`
      : preview?.score_vs_par?.toString() || ''
  const vsParClass = preview
    ? preview.score_vs_par < 0
      ? 'score-birdie'
      : preview.score_vs_par === 0
        ? 'score-par'
        : 'score-bogey'
    : ''

  return (
    <div>
      <h2 className={styles.sectionTitle}>Single Round Import</h2>
      <p className={styles.sectionDesc}>
        Upload a Garmin .fit file to preview and import a single round.
      </p>

      {!preview && !loading && (
        <DropZone
          accept=".fit"
          onFiles={handleFiles}
          disabled={importing}
          label="Drop .fit file here or browse"
        />
      )}

      {loading && (
        <div className={styles.progressWrap}>
          <ProgressBar value={0} />
          <div className={styles.progressLabel}>Parsing FIT file...</div>
        </div>
      )}

      {preview && (
        <>
          <div className={styles.preview}>
            <div className={styles.previewGrid}>
              <div>
                <div className={styles.previewLabel}>Course</div>
                <div className={styles.previewValue}>{preview.course}</div>
              </div>
              <div>
                <div className={styles.previewLabel}>Date</div>
                <div className={styles.previewValue}>{preview.date}</div>
              </div>
              <div>
                <div className={styles.previewLabel}>Tee</div>
                <div className={styles.previewValue}>{preview.tee || 'N/A'}</div>
              </div>
              <div>
                <div className={styles.previewLabel}>Player</div>
                <div className={styles.previewValue}>{preview.player}</div>
              </div>
              <div>
                <div className={styles.previewLabel}>Score</div>
                <div className={styles.previewValue}>
                  {preview.total_strokes}{' '}
                  <span className={vsParClass}>({vsParStr})</span>
                </div>
              </div>
              <div>
                <div className={styles.previewLabel}>Holes</div>
                <div className={styles.previewValue}>{preview.holes_completed}</div>
              </div>
              <div>
                <div className={styles.previewLabel}>Rating / Slope</div>
                <div className={styles.previewValue}>
                  {preview.course_rating?.toFixed(1) || 'N/A'} / {preview.slope_rating || 'N/A'}
                </div>
              </div>
              <div>
                <div className={styles.previewLabel}>Shots Tracked</div>
                <div className={styles.previewValue}>{preview.shots_tracked}</div>
              </div>
            </div>

            <div className={styles.scorecard}>
              {/* Front 9 */}
              <div className={cn(styles.scorecardRow, styles.nine)}>
                {front9.map((s) => (
                  <div key={s.hole} className={cn(styles.scorecardCell, styles.holeNum)}>
                    {s.hole}
                  </div>
                ))}
                <div className={cn(styles.scorecardCell, styles.totalLabel)}>OUT</div>
              </div>
              <div className={cn(styles.scorecardRow, styles.nine)}>
                {front9.map((s) => {
                  const par = holeMap[s.hole]?.par || 0
                  return (
                    <div
                      key={s.hole}
                      className={cn(
                        styles.scorecardCell,
                        styles.scoreCell,
                        par > 0 && getScoreClass(s.strokes, par),
                      )}
                    >
                      {s.strokes}
                    </div>
                  )
                })}
                <div className={cn(styles.scorecardCell, styles.totalScore)}>{frontTotal}</div>
              </div>

              {/* Back 9 */}
              {back9.length > 0 && (
                <>
                  <div className={cn(styles.scorecardRow, styles.nine)} style={{ marginTop: 8 }}>
                    {back9.map((s) => (
                      <div key={s.hole} className={cn(styles.scorecardCell, styles.holeNum)}>
                        {s.hole}
                      </div>
                    ))}
                    <div className={cn(styles.scorecardCell, styles.totalLabel)}>IN</div>
                  </div>
                  <div className={cn(styles.scorecardRow, styles.nine)}>
                    {back9.map((s) => {
                      const par = holeMap[s.hole]?.par || 0
                      return (
                        <div
                          key={s.hole}
                          className={cn(
                            styles.scorecardCell,
                            styles.scoreCell,
                            par > 0 && getScoreClass(s.strokes, par),
                          )}
                        >
                          {s.strokes}
                        </div>
                      )
                    })}
                    <div className={cn(styles.scorecardCell, styles.totalScore)}>{backTotal}</div>
                  </div>
                </>
              )}

              {/* Total row */}
              {back9.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 8,
                    gap: 8,
                    fontSize: '0.85rem',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Total:</span>
                  <span style={{ fontWeight: 700 }}>{preview.total_strokes}</span>
                </div>
              )}
            </div>
          </div>

          {importing && (
            <div className={styles.progressWrap}>
              <ProgressBar value={0} />
              <div className={styles.progressLabel}>Importing round...</div>
            </div>
          )}

          <div className={styles.actions}>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? 'Importing\u2026' : 'Import to Database'}
            </Button>
            <Button variant="secondary" onClick={handleCancel} disabled={importing}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
