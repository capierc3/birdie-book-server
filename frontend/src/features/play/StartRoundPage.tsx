import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGolfClubs, useCourse } from '../../api'
import { Card, CardHeader, Button, Select, FormGroup, Input } from '../../components'
import pageStyles from '../../styles/pages.module.css'
import s from './StartRoundPage.module.css'

const FORMATS = [
  { value: 'STROKE_PLAY', label: 'Stroke Play' },
  { value: 'MATCH_PLAY', label: 'Match Play' },
  { value: 'SCRAMBLE', label: 'Scramble' },
  { value: 'BEST_BALL', label: 'Best Ball' },
  { value: 'STABLEFORD', label: 'Stableford' },
]

export function StartRoundPage() {
  const navigate = useNavigate()
  const { data: clubs } = useGolfClubs()

  const [selectedClubId, setSelectedClubId] = useState<number | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedTeeId, setSelectedTeeId] = useState<number | null>(null)
  const [format, setFormat] = useState('STROKE_PLAY')
  const [players, setPlayers] = useState([''])
  const [mulligans, setMulligans] = useState(false)
  const [gimmes, setGimmes] = useState(false)

  const selectedClub = clubs?.find(c => c.id === selectedClubId)
  const { data: courseDetail } = useCourse(selectedCourseId ?? undefined)

  const handleClubChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setSelectedClubId(id || null)
    const club = clubs?.find(c => c.id === id)
    if (club?.courses?.length === 1) {
      setSelectedCourseId(club.courses[0].id)
    } else {
      setSelectedCourseId(null)
    }
    setSelectedTeeId(null)
  }

  const handleCourseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setSelectedCourseId(id || null)
    setSelectedTeeId(null)
  }

  const handleTeeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setSelectedTeeId(id || null)
  }

  const handleAddPlayer = () => {
    if (players.length < 4) setPlayers([...players, ''])
  }

  const handleRemovePlayer = (idx: number) => {
    setPlayers(players.filter((_, i) => i !== idx))
  }

  const handlePlayerChange = (idx: number, val: string) => {
    const next = [...players]
    next[idx] = val
    setPlayers(next)
  }

  const canStart = selectedCourseId != null && selectedTeeId != null

  const handleStart = () => {
    if (!canStart) return
    const params = new URLSearchParams({ mode: 'play' })
    if (selectedTeeId) params.set('tee', String(selectedTeeId))
    navigate(`/courses/${selectedCourseId}/map?${params.toString()}`)
  }

  return (
    <div className={s.page}>
      <div className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>Start Round</h1>
        <p className={pageStyles.pageDesc}>Set up your round before heading out</p>
      </div>

      {/* Course Selection */}
      <Card>
        <CardHeader title="Course" />
        <div className={s.cardBody}>
          <FormGroup label="Golf Club">
            <Select value={selectedClubId ? String(selectedClubId) : ''} onChange={handleClubChange}>
              <option value="">Select a club...</option>
              {clubs?.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </Select>
          </FormGroup>

          {selectedClub && (selectedClub.courses?.length ?? 0) > 1 && (
            <FormGroup label="Course">
              <Select value={selectedCourseId ? String(selectedCourseId) : ''} onChange={handleCourseChange}>
                <option value="">Select a course...</option>
                {selectedClub.courses.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name || `Course ${c.id}`}</option>
                ))}
              </Select>
            </FormGroup>
          )}

          {selectedCourseId && courseDetail?.tees && courseDetail.tees.length > 0 && (
            <FormGroup label="Tees">
              <Select value={selectedTeeId ? String(selectedTeeId) : ''} onChange={handleTeeChange}>
                <option value="">Select tees...</option>
                {courseDetail.tees.map(t => (
                  <option key={t.id} value={String(t.id)}>
                    {t.tee_name}{t.total_yards ? ` (${t.total_yards} yds)` : ''}
                  </option>
                ))}
              </Select>
            </FormGroup>
          )}
        </div>
      </Card>

      {/* Format */}
      <Card>
        <CardHeader title="Format" />
        <div className={s.cardBody}>
          <FormGroup label="Game Format">
            <Select value={format} onChange={e => setFormat(e.target.value)}>
              {FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </FormGroup>
        </div>
      </Card>

      {/* Players */}
      <Card>
        <CardHeader title="Players" />
        <div className={s.cardBody}>
          {players.map((name, idx) => (
            <div key={idx} className={s.playerRow}>
              <FormGroup label={`Player ${idx + 1}`}>
                <Input
                  value={name}
                  onChange={e => handlePlayerChange(idx, e.target.value)}
                  placeholder="Name"
                />
              </FormGroup>
              {players.length > 1 && (
                <button className={s.removeBtn} onClick={() => handleRemovePlayer(idx)} title="Remove">
                  &times;
                </button>
              )}
            </div>
          ))}
          {players.length < 4 && (
            <Button variant="ghost" size="sm" onClick={handleAddPlayer}>
              + Add Player
            </Button>
          )}
        </div>
      </Card>

      {/* Rules */}
      <Card>
        <CardHeader title="Rules" />
        <div className={s.cardBody}>
          <label className={s.toggle}>
            <input type="checkbox" checked={mulligans} onChange={e => setMulligans(e.target.checked)} />
            <span>Mulligans Allowed</span>
          </label>
          <label className={s.toggle}>
            <input type="checkbox" checked={gimmes} onChange={e => setGimmes(e.target.checked)} />
            <span>Gimmes Allowed</span>
          </label>
        </div>
      </Card>

      {/* Start Button */}
      <div className={s.startSection}>
        <Button variant="primary" onClick={handleStart} disabled={!canStart} className={s.startBtn}>
          Start Round
        </Button>
      </div>
    </div>
  )
}
