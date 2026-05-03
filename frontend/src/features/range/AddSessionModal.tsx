import { useState, useCallback } from 'react'
import { Modal, Button, Input, FormGroup, ResponsiveSelect, DropZone, useToast } from '../../components'
import { useImportCsvText, useImportCsvFile, useCreateManualSession, useClubs } from '../../api'

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Tab = 'csv' | 'manual'

interface ManualShot {
  club: string
  carry_yards: string
  total_yards: string
  ball_speed_mph: string
  height_ft: string
  launch_angle_deg: string
  launch_direction_deg: string
  carry_side_ft: string
  from_pin_yds: string
}

const EMPTY_SHOT: ManualShot = {
  club: '',
  carry_yards: '',
  total_yards: '',
  ball_speed_mph: '',
  height_ft: '',
  launch_angle_deg: '',
  launch_direction_deg: '',
  carry_side_ft: '',
  from_pin_yds: '',
}

const CSV_EXAMPLE = `Club,Carry,Total,Ball Speed,Height,Launch Angle,Launch Dir.,Carry Side,From Pin
Driver,230,245,165,95,12.5,1.2R,5L,15.3
Driver,225,240,162,90,13.1,0.8L,3R,12.1
7 Iron,160,168,120,78,18.2,0.5R,2L,8.5`

function parseNum(s: string): number | null {
  const v = parseFloat(s)
  return isNaN(v) ? null : v
}

export function AddSessionModal({ isOpen, onClose }: Props) {
  const { toast } = useToast()
  const { data: clubs = [] } = useClubs()
  const importCsvText = useImportCsvText()
  const importCsvFile = useImportCsvFile()
  const createManual = useCreateManualSession()

  const [tab, setTab] = useState<Tab>('csv')
  const [csvText, setCsvText] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Manual entry state
  const [shots, setShots] = useState<ManualShot[]>([{ ...EMPTY_SHOT }])

  const busy = importCsvText.isPending || importCsvFile.isPending || createManual.isPending

  const reset = useCallback(() => {
    setCsvText('')
    setCsvFile(null)
    setTitle('')
    setSessionDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setError('')
    setShots([{ ...EMPTY_SHOT }])
  }, [])

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCsvSubmit = async () => {
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
      handleClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed'
      setError(msg)
    }
  }

  const handleManualSubmit = async () => {
    setError('')
    const validShots = shots.filter(s => s.club && (s.carry_yards || s.total_yards))
    if (validShots.length === 0) {
      setError('Add at least one shot with a club and carry/total distance')
      return
    }

    try {
      const result = await createManual.mutateAsync({
        title: title || undefined,
        session_date: sessionDate || undefined,
        notes: notes || undefined,
        shots: validShots.map(s => ({
          club: s.club,
          carry_yards: parseNum(s.carry_yards),
          total_yards: parseNum(s.total_yards),
          ball_speed_mph: parseNum(s.ball_speed_mph),
          height_ft: parseNum(s.height_ft),
          launch_angle_deg: parseNum(s.launch_angle_deg),
          launch_direction_deg: parseNum(s.launch_direction_deg),
          carry_side_ft: parseNum(s.carry_side_ft),
          from_pin_yds: parseNum(s.from_pin_yds),
        })),
      })
      toast(`Created session with ${result.shot_count} shots`, 'success')
      handleClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create session'
      setError(msg)
    }
  }

  const updateShot = (idx: number, field: keyof ManualShot, value: string) => {
    setShots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  const addShot = () => {
    // Pre-fill club from last shot
    const lastClub = shots[shots.length - 1]?.club || ''
    setShots(prev => [...prev, { ...EMPTY_SHOT, club: lastClub }])
  }

  const removeShot = (idx: number) => {
    setShots(prev => prev.filter((_, i) => i !== idx))
  }

  const sortedClubs = [...clubs]
    .filter(c => !c.retired)
    .sort((a, b) => a.sort_order - b.sort_order)

  const handleFiles = (files: File[]) => {
    const f = files[0]
    if (f) {
      setCsvFile(f)
      setCsvText('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Range Session" maxWidth={720}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setTab('csv')}
          style={{
            padding: '8px 20px',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'csv' ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === 'csv' ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: tab === 'csv' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.88rem',
          }}
        >
          CSV Import
        </button>
        <button
          onClick={() => setTab('manual')}
          style={{
            padding: '8px 20px',
            background: 'none',
            border: 'none',
            borderBottom: tab === 'manual' ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === 'manual' ? 'var(--text)' : 'var(--text-muted)',
            fontWeight: tab === 'manual' ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.88rem',
          }}
        >
          Manual Entry
        </button>
      </div>

      {/* Session metadata — shared between tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormGroup label="Date">
          <Input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
        </FormGroup>
        <FormGroup label="Title (optional)">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Trackman Range Session" />
        </FormGroup>
      </div>
      <FormGroup label="Notes (optional)">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
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

      {/* CSV Tab */}
      {tab === 'csv' && (
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
            onChange={e => { setCsvText(e.target.value); setCsvFile(null) }}
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
            Required columns: <strong>Club</strong> + <strong>Carry</strong> or <strong>Total</strong>.
            Optional: Ball Speed, Height, Launch Angle, Launch Dir., Carry Side, From Pin, Spin Rate, Club Speed.
          </div>
        </div>
      )}

      {/* Manual Entry Tab */}
      {tab === 'manual' && (
        <div style={{ marginTop: 12 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Club</th>
                  <th style={thStyle}>Carry</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Ball Spd</th>
                  <th style={thStyle}>Height</th>
                  <th style={thStyle}>Launch Ang.</th>
                  <th style={thStyle}>Launch Dir.</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {shots.map((shot, idx) => (
                  <tr key={idx}>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={tdStyle}>
                      <ResponsiveSelect
                        value={shot.club}
                        onChange={v => updateShot(idx, 'club', v)}
                        options={[
                          { value: '', label: '-- Club --' },
                          ...sortedClubs.map(c => ({ value: c.club_type, label: c.club_type })),
                        ]}
                        title="Club"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.carry_yards}
                        onChange={e => updateShot(idx, 'carry_yards', e.target.value)}
                        style={numInputStyle}
                        placeholder="yds"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.total_yards}
                        onChange={e => updateShot(idx, 'total_yards', e.target.value)}
                        style={numInputStyle}
                        placeholder="yds"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.ball_speed_mph}
                        onChange={e => updateShot(idx, 'ball_speed_mph', e.target.value)}
                        style={numInputStyle}
                        placeholder="mph"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.height_ft}
                        onChange={e => updateShot(idx, 'height_ft', e.target.value)}
                        style={numInputStyle}
                        placeholder="ft"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.launch_angle_deg}
                        onChange={e => updateShot(idx, 'launch_angle_deg', e.target.value)}
                        style={numInputStyle}
                        placeholder="deg"
                      />
                    </td>
                    <td style={tdStyle}>
                      <Input
                        type="number"
                        value={shot.launch_direction_deg}
                        onChange={e => updateShot(idx, 'launch_direction_deg', e.target.value)}
                        style={numInputStyle}
                        placeholder="deg"
                      />
                    </td>
                    <td style={tdStyle}>
                      {shots.length > 1 && (
                        <button
                          onClick={() => removeShot(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--danger, #ef4444)',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            padding: '2px 6px',
                          }}
                          title="Remove shot"
                        >
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={addShot}
            style={{ marginTop: 8 }}
          >
            + Add Shot
          </Button>
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--danger, #ef4444)', fontSize: '0.84rem', marginTop: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <Button variant="ghost" onClick={handleClose} disabled={busy}>Cancel</Button>
        <Button
          onClick={tab === 'csv' ? handleCsvSubmit : handleManualSubmit}
          disabled={busy}
        >
          {busy ? 'Importing...' : tab === 'csv' ? 'Import CSV' : 'Create Session'}
        </Button>
      </div>
    </Modal>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 4px',
  fontWeight: 600,
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '4px',
  verticalAlign: 'middle',
}

const numInputStyle: React.CSSProperties = {
  width: 65,
  fontSize: '0.82rem',
  padding: '4px 6px',
  textAlign: 'right',
}
