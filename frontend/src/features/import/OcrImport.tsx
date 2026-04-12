import { useState, useCallback } from 'react'
import { DropZone, Button, Input, FormGroup, useToast } from '../../components'
import { useOcrExtract, useClubs, useImportCsvText } from '../../api'
import type { OcrCell } from '../../api'
import styles from './import.module.css'

interface OcrImportProps {
  sessionDate: string
  title: string
  notes: string
}

const CONF_THRESHOLD = 70
const OUTLIER_CONF = 50 // confidence assigned to statistical outliers

// Column options that map to DB fields
const COLUMN_OPTIONS = [
  { label: '—', value: '' },
  { label: 'Carry', value: 'carry_yards' },
  { label: 'Total', value: 'total_yards' },
  { label: 'Ball Speed', value: 'ball_speed_mph' },
  { label: 'Height', value: 'height_ft' },
  { label: 'Launch Ang.', value: 'launch_angle_deg' },
  { label: 'Launch Dir.', value: 'launch_direction_deg' },
  { label: 'Carry Side', value: 'carry_side_ft' },
  { label: 'From Pin', value: 'from_pin_yds' },
  { label: 'Club Speed', value: 'club_speed_mph' },
  { label: 'Spin Rate', value: 'spin_rate_rpm' },
  { label: 'Smash Factor', value: 'smash_factor' },
  { label: 'Attack Angle', value: 'attack_angle_deg' },
  { label: 'Club Path', value: 'club_path_deg' },
  { label: 'Face Angle', value: 'face_angle_deg' },
  { label: 'Spin Axis', value: 'spin_axis_deg' },
  { label: 'Descent Angle', value: 'landing_angle_deg' },
]

// Default headers for Trackman 8-column layout
const DEFAULT_HEADERS = [
  'carry_yards',
  'total_yards',
  'ball_speed_mph',
  'height_ft',
  'launch_angle_deg',
  'launch_direction_deg',
  'carry_side_ft',
  'from_pin_yds',
]

// Club abbreviation → display name (matches rapsodo_club_types.py)
const CLUB_ABBREV_MAP: Record<string, string> = {
  d: 'Driver',
  '2w': '2 Wood',
  '3w': '3 Wood',
  '4w': '4 Wood',
  '5w': '5 Wood',
  '7w': '7 Wood',
  '9w': '9 Wood',
  '2h': '2 Hybrid',
  '3h': '3 Hybrid',
  '4h': '4 Hybrid',
  '5h': '5 Hybrid',
  '6h': '6 Hybrid',
  '1i': '1 Iron',
  '2i': '2 Iron',
  '3i': '3 Iron',
  '4i': '4 Iron',
  '5i': '5 Iron',
  '6i': '6 Iron',
  '7i': '7 Iron',
  '8i': '8 Iron',
  '9i': '9 Iron',
  pw: 'Pitching Wedge',
  gw: 'Gap Wedge',
  sw: 'Sand Wedge',
  lw: 'Lob Wedge',
}

// CLUB_OPTIONS built dynamically from user's bag via useClubs()

function parseClubFromFilename(filename: string, availableClubs: string[]): string {
  // Strip extension and trailing digits: "D1.png" → "d", "3W2.png" → "3w", "PW1.png" → "pw"
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase()
  const abbrev = base.replace(/\d+$/, '')
  const mapped = CLUB_ABBREV_MAP[abbrev] ?? ''
  // Only return if this club exists in the user's bag
  if (mapped && availableClubs.includes(mapped)) return mapped
  return ''
}

function cellStyle(conf: number): React.CSSProperties {
  const base: React.CSSProperties = { padding: '8px 12px', whiteSpace: 'nowrap' }
  if (conf <= OUTLIER_CONF) {
    // OCR low confidence — red
    return { ...base, background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger, #ef4444)', fontWeight: 600 }
  }
  if (conf < CONF_THRESHOLD) {
    // Statistical outlier — yellow/warning
    return { ...base, background: 'rgba(255, 167, 38, 0.15)', color: 'var(--warning, #ffa726)', fontWeight: 600 }
  }
  return { ...base, color: 'var(--text)' }
}

const selectStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '0.78rem',
  fontWeight: 600,
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-input, var(--bg))',
  color: 'var(--text)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const clubSelectStyle: React.CSSProperties = {
  ...selectStyle,
  width: 'auto',
  minWidth: 100,
  fontSize: '0.8rem',
  fontWeight: 400,
  padding: '5px 6px',
}

export function OcrImport({ sessionDate, title, notes }: OcrImportProps) {
  const ocrExtract = useOcrExtract()
  const importCsv = useImportCsvText()
  const { toast } = useToast()
  const { data: clubs = [] } = useClubs()
  // Sort clubs in canonical bag order: Driver → Woods → Hybrids → Irons → Wedges → Putter → Unknown
  const BAG_ORDER: Record<string, number> = {
    Driver: 1,
    '2 Wood': 10, '3 Wood': 11, '4 Wood': 12, '5 Wood': 13, '7 Wood': 14, '9 Wood': 15,
    '2 Hybrid': 20, '3 Hybrid': 21, '4 Hybrid': 22, '5 Hybrid': 23, '6 Hybrid': 24,
    '1 Iron': 30, '2 Iron': 31, '3 Iron': 32, '4 Iron': 33, '5 Iron': 34,
    '6 Iron': 35, '7 Iron': 36, '8 Iron': 37, '9 Iron': 38,
    'Pitching Wedge': 40, 'Gap Wedge': 41, 'Sand Wedge': 42, 'Lob Wedge': 43,
    Putter: 50, Unknown: 99,
  }
  const sortedClubs = [...clubs].sort(
    (a, b) => (BAG_ORDER[a.club_type] ?? 60) - (BAG_ORDER[b.club_type] ?? 60),
  )
  const clubOptions = ['', ...sortedClubs.map((c) => c.club_type)]
  const [colImages, setColImages] = useState(2)
  const [rowImages, setRowImages] = useState(3)
  const [files, setFiles] = useState<File[]>([])
  const [combinedRows, setCombinedRows] = useState<OcrCell[][]>([])
  const [headers, setHeaders] = useState<string[]>(DEFAULT_HEADERS)
  const [rowClubs, setRowClubs] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')

  const totalSlots = colImages * rowImages

  const handleFiles = (dropped: File[]) => {
    const sorted = [...dropped].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    )
    setFiles(sorted)
    setCombinedRows([])
    setRowClubs([])
    setError('')
  }

  const handleHeaderChange = (colIdx: number, value: string) => {
    setHeaders((prev) => {
      const next = [...prev]
      while (next.length <= colIdx) next.push('')
      next[colIdx] = value
      return next
    })
  }

  const handleClubChange = (rowIdx: number, value: string) => {
    setRowClubs((prev) => {
      const next = [...prev]
      next[rowIdx] = value
      return next
    })
  }

  const handleCellEdit = (rowIdx: number, colIdx: number, value: string) => {
    setCombinedRows((prev) => {
      const next = prev.map((r) => [...r])
      next[rowIdx][colIdx] = { text: value, conf: 100 }
      return next
    })
  }

  const handleCellApprove = (rowIdx: number, colIdx: number) => {
    setCombinedRows((prev) => {
      const next = prev.map((r) => [...r])
      next[rowIdx][colIdx] = { ...next[rowIdx][colIdx], conf: 100 }
      return next
    })
  }

  const handleAnalyze = () => {
    if (combinedRows.length === 0) return

    setCombinedRows((prev) => {
      const next = prev.map((r) => [...r])
      const maxCols = Math.max(...next.map((r) => r.length))

      // Step 1: Reset previous outlier flags back to clean
      for (let row = 0; row < next.length; row++) {
        for (let col = 0; col < next[row].length; col++) {
          const c = next[row][col]
          if (c.conf > OUTLIER_CONF && c.conf < CONF_THRESHOLD) {
            next[row][col] = { ...c, conf: 100 }
          }
        }
      }

      // Step 2: Statistical outlier detection per club+column (z-score > 2.0)
      for (let col = 0; col < maxCols; col++) {
        const clubGroups: Record<string, { rowIdx: number; val: number }[]> = {}
        for (let row = 0; row < next.length; row++) {
          const cell = next[row][col]
          if (!cell || cell.conf <= OUTLIER_CONF) continue
          const num = parseFloat(cell.text.replace(/[LR]/g, ''))
          if (isNaN(num)) continue
          const club = rowClubs[row] || '_all'
          if (!clubGroups[club]) clubGroups[club] = []
          clubGroups[club].push({ rowIdx: row, val: num })
        }

        for (const entries of Object.values(clubGroups)) {
          if (entries.length < 4) continue
          const vals = entries.map((e) => e.val)
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length
          const stdDev = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
          if (stdDev === 0) continue

          for (const entry of entries) {
            const zScore = Math.abs(entry.val - mean) / stdDev
            if (zScore > 2.0) {
              next[entry.rowIdx][col] = { ...next[entry.rowIdx][col], conf: OUTLIER_CONF + 10 }
            }
          }
        }
      }

      // Step 3: Cross-column checks
      const carryCol = headers.indexOf('carry_yards')
      const totalCol = headers.indexOf('total_yards')

      if (carryCol >= 0 && totalCol >= 0) {
        for (let row = 0; row < next.length; row++) {
          const carryCell = next[row][carryCol]
          const totalCell = next[row][totalCol]
          if (!carryCell || !totalCell) continue
          const carry = parseFloat(carryCell.text)
          const total = parseFloat(totalCell.text)
          if (isNaN(carry) || isNaN(total)) continue
          if (total < carry) {
            // Flag both — total should always be >= carry
            if (totalCell.conf >= CONF_THRESHOLD) {
              next[row][totalCol] = { ...totalCell, conf: OUTLIER_CONF + 10 }
            }
            if (carryCell.conf >= CONF_THRESHOLD) {
              next[row][carryCol] = { ...carryCell, conf: OUTLIER_CONF + 10 }
            }
          }
        }
      }

      return next
    })
  }

  const handleExtract = useCallback(async () => {
    if (files.length < totalSlots) {
      setError(`Need ${totalSlots} images, got ${files.length}`)
      return
    }
    setError('')
    setExtracting(true)
    try {
      const results: OcrCell[][][] = []
      for (let i = 0; i < totalSlots; i++) {
        const result = await ocrExtract.mutateAsync(files[i]!)
        results.push(result.rows)
      }

      // Assemble grid and track which "row image" each data row came from
      const allRows: OcrCell[][] = []
      const allClubs: string[] = []

      for (let gr = 0; gr < rowImages; gr++) {
        const gridRowResults: OcrCell[][][] = []
        // Parse club from the first column-image filename for this grid row
        const firstImageIdx = gr * colImages
        const club = parseClubFromFilename(files[firstImageIdx]?.name ?? '', clubOptions)

        for (let gc = 0; gc < colImages; gc++) {
          gridRowResults.push(results[gr * colImages + gc])
        }
        const maxDataRows = Math.max(...gridRowResults.map((r) => r.length))
        const colCounts = gridRowResults.map((r) =>
          r.length > 0 ? Math.max(...r.map((row) => row.length)) : 0,
        )

        for (let dr = 0; dr < maxDataRows; dr++) {
          const mergedRow: OcrCell[] = []
          for (let gc = 0; gc < colImages; gc++) {
            const dataRow = gridRowResults[gc][dr] ?? []
            const padded = [...dataRow]
            while (padded.length < colCounts[gc]) {
              padded.push({ text: '', conf: 0 })
            }
            mergedRow.push(...padded)
          }
          allRows.push(mergedRow)
          allClubs.push(club)
        }
      }

      setCombinedRows(allRows)
      setRowClubs(allClubs)

      // Ensure headers array covers all columns
      const totalCols = allRows.length > 0 ? Math.max(...allRows.map((r) => r.length)) : 0
      setHeaders((prev) => {
        if (prev.length >= totalCols) return prev
        const next = [...prev]
        while (next.length < totalCols) next.push('')
        return next
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'OCR extraction failed')
    } finally {
      setExtracting(false)
    }
  }, [files, totalSlots, colImages, rowImages, ocrExtract, clubOptions])

  const buildCsvText = useCallback(() => {
    const headerLabels = [
      'Club',
      ...headers.map((val) => {
        const opt = COLUMN_OPTIONS.find((o) => o.value === val)
        return opt?.label ?? ''
      }),
    ]
    const headerLine = headerLabels.join(',')
    const dataLines = combinedRows.map((row, i) => {
      const club = rowClubs[i] ?? ''
      return [club, ...row.map((c) => c.text)].join(',')
    })
    return [headerLine, ...dataLines].join('\n')
  }, [combinedRows, headers, rowClubs])

  const handleSaveCsv = useCallback(() => {
    if (combinedRows.length === 0) return
    const csv = buildCsvText()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ocr_extract.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [combinedRows, buildCsvText])

  const handleImportToDb = useCallback(async () => {
    if (combinedRows.length === 0) return
    // Validate all rows have a club
    const missingClub = rowClubs.findIndex((c) => !c)
    if (missingClub >= 0) {
      setError(`Row ${missingClub + 1} is missing a club assignment`)
      return
    }
    setError('')
    try {
      const csv = buildCsvText()
      const result = await importCsv.mutateAsync({
        csv_text: csv,
        title: title || undefined,
        session_date: sessionDate || undefined,
        notes: notes || undefined,
      })
      toast(`Imported ${result.shot_count} shots`, 'success')
      setCombinedRows([])
      setRowClubs([])
      setFiles([])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    }
  }, [combinedRows, rowClubs, buildCsvText, importCsv, title, sessionDate, notes, toast])

  const rows = combinedRows
  const maxCols = rows.length > 0 ? Math.max(...rows.map((r) => r.length)) : 0
  const ocrFlagged = rows.reduce(
    (sum, row) => sum + row.filter((c) => c.conf <= OUTLIER_CONF).length,
    0,
  )
  const outlierFlagged = rows.reduce(
    (sum, row) => sum + row.filter((c) => c.conf > OUTLIER_CONF && c.conf < CONF_THRESHOLD).length,
    0,
  )
  const flaggedCount = ocrFlagged + outlierFlagged

  return (
    <div>
      <h2 className={styles.sectionTitle}>OCR Image Extract</h2>
      <p className={styles.sectionDesc}>
        Extract table data from Trackman screenshots. Set the grid dimensions, drop images in
        reading order, then extract. Name files with club prefix to auto-detect (e.g. D1.png, 7I1.png, PW1.png).
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 16,
          maxWidth: 320,
        }}
      >
        <FormGroup label="Column images">
          <Input
            type="number"
            min={1}
            max={6}
            value={colImages}
            onChange={(e) => {
              setColImages(Math.max(1, Math.min(6, Number(e.target.value))))
              setCombinedRows([])
            }}
          />
        </FormGroup>
        <FormGroup label="Row images">
          <Input
            type="number"
            min={1}
            max={10}
            value={rowImages}
            onChange={(e) => {
              setRowImages(Math.max(1, Math.min(10, Number(e.target.value))))
              setCombinedRows([])
            }}
          />
        </FormGroup>
      </div>

      <DropZone
        accept=".png,.jpg,.jpeg"
        multiple
        onFiles={handleFiles}
        label={
          files.length > 0
            ? `${files.length} image${files.length > 1 ? 's' : ''} selected`
            : `Drop ${totalSlots} images here or browse`
        }
        sublabel={`Expects ${totalSlots} images in reading order (sorted by filename)`}
      />

      {files.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${colImages}, 1fr)`,
            gap: '2px 12px',
            marginTop: 10,
            padding: '8px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '0.78rem',
          }}
        >
          {Array.from({ length: totalSlots }, (_, i) => {
            const club = parseClubFromFilename(files[i]?.name ?? '', clubOptions)
            return (
              <div
                key={i}
                style={{
                  padding: '3px 0',
                  color: files[i] ? 'var(--text)' : 'var(--danger, #ef4444)',
                  display: 'flex',
                  gap: 6,
                }}
              >
                <span style={{ color: 'var(--text-dim)', minWidth: 40 }}>
                  R{Math.floor(i / colImages) + 1}C{(i % colImages) + 1}
                </span>
                <span>{files[i]?.name ?? 'missing'}</span>
                {club && (
                  <span style={{ color: 'var(--accent)', marginLeft: 'auto' }}>{club}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger, #ef4444)', fontSize: '0.84rem', marginTop: 12 }}>
          {error}
        </div>
      )}

      <div className={styles.actions}>
        <Button onClick={handleExtract} disabled={extracting}>
          {extracting ? 'Extracting...' : 'Extract Data'}
        </Button>
        {rows.length > 0 && <Button onClick={handleAnalyze}>Analyze Data</Button>}
        {rows.length > 0 && (
          <Button onClick={handleImportToDb} disabled={importCsv.isPending}>
            {importCsv.isPending ? 'Importing...' : 'Import to DB'}
          </Button>
        )}
        {rows.length > 0 && (
          <button
            onClick={handleSaveCsv}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '4px 8px',
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            {rows.length} rows &times; {maxCols + 1} columns
            {ocrFlagged > 0 && (
              <span style={{ color: 'var(--danger, #ef4444)', marginLeft: 12 }}>
                {ocrFlagged} OCR
              </span>
            )}
            {outlierFlagged > 0 && (
              <span style={{ color: 'var(--warning, #ffa726)', marginLeft: 12 }}>
                {outlierFlagged} outlier{outlierFlagged > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div
            style={{
              overflowX: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th
                    style={{
                      padding: '6px 8px',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textAlign: 'left',
                    }}
                  >
                    Club
                  </th>
                  {Array.from({ length: maxCols }, (_, j) => (
                    <th key={j} style={{ padding: '6px 8px' }}>
                      <select
                        value={headers[j] ?? ''}
                        onChange={(e) => handleHeaderChange(j, e.target.value)}
                        style={selectStyle}
                      >
                        {COLUMN_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px' }}>
                      <select
                        value={rowClubs[i] ?? ''}
                        onChange={(e) => handleClubChange(i, e.target.value)}
                        style={clubSelectStyle}
                      >
                        {clubOptions.map((club) => (
                          <option key={club} value={club}>
                            {club || '—'}
                          </option>
                        ))}
                      </select>
                    </td>
                    {row.map((cell: OcrCell, j: number) => (
                      <td
                        key={j}
                        style={{ ...cellStyle(cell.conf), position: 'relative' }}
                        title={`Confidence: ${cell.conf}%`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            value={cell.text}
                            onChange={(e) => handleCellEdit(i, j, e.target.value)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'inherit',
                              font: 'inherit',
                              width: '100%',
                              minWidth: 40,
                              padding: 0,
                              outline: 'none',
                            }}
                          />
                          {cell.conf < CONF_THRESHOLD && (
                            <button
                              onClick={() => handleCellApprove(i, j)}
                              title="Mark as correct"
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent, #22c55e)',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '0.9rem',
                                lineHeight: 1,
                                flexShrink: 0,
                              }}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
