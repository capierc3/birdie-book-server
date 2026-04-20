import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGolfClubs, useCourse, useCreatePlaySession } from '../../api'
import { Card, CardHeader, Button, FormGroup, Input, PickerTrigger, PickerSheet } from '../../components'
import type { PickerOption } from '../../components'
import { useGps } from '../../contexts/GpsContext'
import { haversineYards } from '../../features/course-map/geoUtils'
import { ClubSearchPicker } from '../golf-club/ClubSearchPicker'
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
  const gps = useGps()
  const createSession = useCreatePlaySession()
  const [startError, setStartError] = useState<string>('')

  const [selectedClubId, setSelectedClubId] = useState<number | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedTeeId, setSelectedTeeId] = useState<number | null>(null)
  const [format, setFormat] = useState('STROKE_PLAY')
  const [players, setPlayers] = useState([''])
  const [clubPickerOpen, setClubPickerOpen] = useState(false)
  const [coursePickerOpen, setCoursePickerOpen] = useState(false)
  const [teePickerOpen, setTeePickerOpen] = useState(false)
  const [formatPickerOpen, setFormatPickerOpen] = useState(false)

  const selectedClub = clubs?.find(c => c.id === selectedClubId)
  const { data: courseDetail } = useCourse(selectedCourseId ?? undefined)

  const selectedClubLabel = useMemo(() => {
    if (!selectedClub) return undefined
    const hasGps = gps.lat != null && gps.lng != null
    const distanceMiles = (hasGps && selectedClub.lat != null && selectedClub.lng != null)
      ? haversineYards(gps.lat!, gps.lng!, selectedClub.lat, selectedClub.lng) / 1760
      : null
    const dist = distanceMiles != null ? ` (${distanceMiles.toFixed(1)} mi)` : ''
    return selectedClub.name + dist
  }, [selectedClub, gps.lat, gps.lng])

  const handleClubSelect = (clubId: number) => {
    setSelectedClubId(clubId)
    const club = clubs?.find(c => c.id === clubId)
    if (club?.courses?.length === 1) {
      setSelectedCourseId(club.courses[0].id)
    } else {
      setSelectedCourseId(null)
    }
    setSelectedTeeId(null)
  }

  const courseOptions: PickerOption[] = useMemo(() => {
    if (!selectedClub?.courses) return []
    return selectedClub.courses.map(c => ({
      value: String(c.id),
      label: c.name || `Course ${c.id}`,
    }))
  }, [selectedClub])

  const selectedCourseLabel = useMemo(() => {
    if (!selectedCourseId || !selectedClub?.courses) return undefined
    const c = selectedClub.courses.find(x => x.id === selectedCourseId)
    return c ? (c.name || `Course ${c.id}`) : undefined
  }, [selectedCourseId, selectedClub])

  const teeOptions: PickerOption[] = useMemo(() => {
    if (!courseDetail?.tees) return []
    return courseDetail.tees.map(t => ({
      value: String(t.id),
      label: t.tee_name,
      detail: t.total_yards ? `${t.total_yards} yds` : undefined,
    }))
  }, [courseDetail])

  const selectedTeeLabel = useMemo(() => {
    if (!selectedTeeId || !courseDetail?.tees) return undefined
    const t = courseDetail.tees.find(x => x.id === selectedTeeId)
    if (!t) return undefined
    return t.total_yards ? `${t.tee_name} (${t.total_yards} yds)` : t.tee_name
  }, [selectedTeeId, courseDetail])

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

  const handleStart = async () => {
    if (!canStart) return
    setStartError('')
    try {
      const session = await createSession.mutateAsync({
        course_id: selectedCourseId!,
        tee_id: selectedTeeId!,
        game_format: format,
        holes_played: 18,
        partners: players
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
          .map((name) => ({ player_name: name })),
      })
      navigate(`/play/sessions/${session.id}`)
    } catch (e) {
      setStartError(`Failed to start: ${(e as Error).message}`)
    }
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
            <PickerTrigger
              value={selectedClubId ? String(selectedClubId) : null}
              displayLabel={selectedClubLabel}
              placeholder="Select a club..."
              onClick={() => setClubPickerOpen(true)}
            />
          </FormGroup>

          <ClubSearchPicker
            isOpen={clubPickerOpen}
            onClose={() => setClubPickerOpen(false)}
            onSelect={handleClubSelect}
            selectedClubId={selectedClubId}
          />

          {selectedClub && (selectedClub.courses?.length ?? 0) > 1 && (
            <FormGroup label="Course">
              <PickerTrigger
                value={selectedCourseId ? String(selectedCourseId) : null}
                displayLabel={selectedCourseLabel}
                placeholder="Select a course..."
                onClick={() => setCoursePickerOpen(true)}
              />
              <PickerSheet
                isOpen={coursePickerOpen}
                onClose={() => setCoursePickerOpen(false)}
                title="Select Course"
                options={courseOptions}
                selectedValue={selectedCourseId ? String(selectedCourseId) : null}
                onSelect={val => {
                  const id = Number(val)
                  setSelectedCourseId(id || null)
                  setSelectedTeeId(null)
                }}
              />
            </FormGroup>
          )}

          {selectedCourseId && courseDetail?.tees && courseDetail.tees.length > 0 && (
            <FormGroup label="Tees">
              <PickerTrigger
                value={selectedTeeId ? String(selectedTeeId) : null}
                displayLabel={selectedTeeLabel}
                placeholder="Select tees..."
                onClick={() => setTeePickerOpen(true)}
              />
              <PickerSheet
                isOpen={teePickerOpen}
                onClose={() => setTeePickerOpen(false)}
                title="Select Tees"
                options={teeOptions}
                selectedValue={selectedTeeId ? String(selectedTeeId) : null}
                onSelect={val => setSelectedTeeId(Number(val) || null)}
              />
            </FormGroup>
          )}
        </div>
      </Card>

      {/* Format */}
      <Card>
        <CardHeader title="Format" />
        <div className={s.cardBody}>
          <FormGroup label="Game Format">
            <PickerTrigger
              value={format}
              displayLabel={FORMATS.find(f => f.value === format)?.label}
              placeholder="Select a format..."
              onClick={() => setFormatPickerOpen(true)}
            />
            <PickerSheet
              isOpen={formatPickerOpen}
              onClose={() => setFormatPickerOpen(false)}
              title="Select Format"
              options={FORMATS.map(f => ({ value: f.value, label: f.label }))}
              selectedValue={format}
              onSelect={val => setFormat(val)}
            />
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

      {/* Start Button */}
      <div className={s.startSection}>
        {startError && <p className={s.createError}>{startError}</p>}
        <Button
          variant="primary"
          onClick={handleStart}
          disabled={!canStart || createSession.isPending}
          className={s.startBtn}
        >
          {createSession.isPending ? 'Starting…' : 'Start Round'}
        </Button>
      </div>
    </div>
  )
}
