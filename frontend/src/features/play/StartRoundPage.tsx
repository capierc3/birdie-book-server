import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGolfClubs, useCourse, useCreatePlaySession, useMe, usePartners } from '../../api'
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
  const { data: me } = useMe()
  const { data: knownPartners } = usePartners()
  const gps = useGps()
  const createSession = useCreatePlaySession()
  const [startError, setStartError] = useState<string>('')

  const [selectedClubId, setSelectedClubId] = useState<number | null>(null)
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null)
  const [selectedTeeId, setSelectedTeeId] = useState<number | null>(null)
  const [format, setFormat] = useState('STROKE_PLAY')
  // Player 1 is the current user (read-only); this list is partners only.
  const [partners, setPartners] = useState<{ name: string; is_teammate: boolean }[]>([])
  const [focusedPartnerIdx, setFocusedPartnerIdx] = useState<number | null>(null)
  const partnerInputRefs = useRef<(HTMLInputElement | null)[]>([])
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
    if (partners.length < 3) setPartners([...partners, { name: '', is_teammate: false }])
  }

  const handleRemovePlayer = (idx: number) => {
    setPartners(partners.filter((_, i) => i !== idx))
  }

  const handlePlayerChange = (idx: number, val: string) => {
    const next = [...partners]
    next[idx] = { ...next[idx], name: val }
    setPartners(next)
  }

  const handleTeammateToggle = (idx: number) => {
    const next = [...partners]
    next[idx] = { ...next[idx], is_teammate: !next[idx].is_teammate }
    setPartners(next)
  }

  const handleQuickAddPartner = (name: string) => {
    if (partners.length >= 3) return
    // If there's an empty partner slot, fill it; otherwise append a new row.
    const emptyIdx = partners.findIndex((p) => p.name.trim().length === 0)
    if (emptyIdx >= 0) {
      const next = [...partners]
      next[emptyIdx] = { ...next[emptyIdx], name }
      setPartners(next)
    } else {
      setPartners([...partners, { name, is_teammate: false }])
    }
  }

  const quickAddSuggestions = useMemo(() => {
    if (!knownPartners) return []
    const taken = new Set(
      partners
        .map((p) => p.name.trim().toLowerCase())
        .filter((n) => n.length > 0),
    )
    return knownPartners
      .filter((p) => p.times_played_with > 0)
      .filter((p) => !taken.has(p.name.toLowerCase()))
      .slice(0, 6)
  }, [knownPartners, partners])

  // For the focused partner input, build a typeahead list filtered by what's
  // typed. Excludes partners already added in *other* rows (so the user can
  // still see "John" when their current row literally says "John").
  const getRowSuggestions = (idx: number) => {
    if (!knownPartners) return []
    const typed = partners[idx]?.name.trim().toLowerCase() ?? ''
    const otherRowNames = new Set(
      partners
        .map((p, i) => (i === idx ? '' : p.name.trim().toLowerCase()))
        .filter((n) => n.length > 0),
    )
    return knownPartners
      .filter((p) => !otherRowNames.has(p.name.toLowerCase()))
      .filter((p) => (typed ? p.name.toLowerCase().includes(typed) : true))
      .slice(0, 8)
  }

  const handleSuggestionPick = (idx: number, name: string) => {
    const next = [...partners]
    next[idx] = { ...next[idx], name }
    setPartners(next)
    setFocusedPartnerIdx(null)
    partnerInputRefs.current[idx]?.blur()
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
        partners: partners
          .map((p) => ({ player_name: p.name.trim(), is_teammate: p.is_teammate }))
          .filter((p) => p.player_name.length > 0),
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
          <div className={s.selfPlayer}>
            <span className={s.selfPlayerLabel}>Player 1 (you)</span>
            <span className={s.selfPlayerName}>{me?.name ?? '…'}</span>
          </div>

          {partners.map((p, idx) => {
            const suggestions = focusedPartnerIdx === idx ? getRowSuggestions(idx) : []
            const showDropdown = focusedPartnerIdx === idx && suggestions.length > 0
            return (
              <div key={idx} className={s.playerRow}>
                <FormGroup label={`Player ${idx + 2}`}>
                  <div className={s.partnerInputWrap}>
                    <Input
                      ref={(el) => { partnerInputRefs.current[idx] = el }}
                      value={p.name}
                      onChange={e => handlePlayerChange(idx, e.target.value)}
                      onFocus={() => setFocusedPartnerIdx(idx)}
                      onBlur={() => setFocusedPartnerIdx((cur) => (cur === idx ? null : cur))}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setFocusedPartnerIdx(null)
                          partnerInputRefs.current[idx]?.blur()
                        }
                      }}
                      placeholder="Name"
                      autoComplete="off"
                    />
                    {showDropdown && (
                      <ul className={s.partnerDropdown} role="listbox">
                        {suggestions.map((sug) => (
                          <li
                            key={sug.id}
                            role="option"
                            aria-selected={sug.name.toLowerCase() === p.name.trim().toLowerCase()}
                            className={s.partnerOption}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSuggestionPick(idx, sug.name)}
                          >
                            <span className={s.partnerOptionName}>{sug.name}</span>
                            <span className={s.partnerOptionMeta}>
                              {sug.times_played_with === 0
                                ? 'Saved partner — never played with'
                                : `${sug.times_played_with} round${sug.times_played_with === 1 ? '' : 's'}${sug.last_played ? ` • last ${sug.last_played}` : ''}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </FormGroup>
                <button
                  type="button"
                  className={`${s.teammateBtn} ${p.is_teammate ? s.teammateOn : ''}`}
                  onClick={() => handleTeammateToggle(idx)}
                  title={p.is_teammate ? 'On your team' : 'Mark as teammate'}
                  aria-pressed={p.is_teammate}
                >
                  Team
                </button>
                <button className={s.removeBtn} onClick={() => handleRemovePlayer(idx)} title="Remove">
                  &times;
                </button>
              </div>
            )
          })}
          {partners.length < 3 && (
            <Button variant="ghost" size="sm" onClick={handleAddPlayer}>
              + Add Player
            </Button>
          )}

          {quickAddSuggestions.length > 0 && partners.length < 3 && (
            <div className={s.quickAddSection}>
              <span className={s.quickAddLabel}>Recent</span>
              <div className={s.quickAddChips}>
                {quickAddSuggestions.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={s.quickAddChip}
                    onClick={() => handleQuickAddPartner(p.name)}
                    title={
                      p.last_played
                        ? `Last played ${p.last_played} • ${p.times_played_with} round${
                            p.times_played_with === 1 ? '' : 's'
                          } together`
                        : `${p.times_played_with} round${p.times_played_with === 1 ? '' : 's'} together`
                    }
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
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
