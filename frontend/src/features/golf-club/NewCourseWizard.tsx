import { useState, useEffect, useRef } from 'react'
import { X, Loader2, CheckCircle, AlertTriangle, Check } from 'lucide-react'
import { Button, Input } from '../../components'
import { useSearchCreateCourse, useOsmSearch, useOsmLinkClub } from '../../api'
import type { PlaceCandidate, SearchCreateResult, OsmSearchResult } from '../../api'
import s from './NewCourseWizard.module.css'

interface NewCourseWizardProps {
  isOpen: boolean
  candidate: PlaceCandidate
  onComplete: (golfClubId: number) => void
  onCancel: () => void
}

type Step = 'creating' | 'review' | 'osm' | 'done'

function cleanNameForOsmSearch(name: string): string {
  return name.replace(/\s*(golf\s*)?(club|course|links|resort)\s*$/i, '').trim() || name
}

export function NewCourseWizard({ isOpen, candidate, onComplete, onCancel }: NewCourseWizardProps) {
  const [step, setStep] = useState<Step>('creating')
  const [created, setCreated] = useState<SearchCreateResult | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [osmQuery, setOsmQuery] = useState(() => cleanNameForOsmSearch(candidate.name))
  const [osmResults, setOsmResults] = useState<OsmSearchResult[]>([])
  const [osmLinked, setOsmLinked] = useState(false)
  const [osmError, setOsmError] = useState<string | null>(null)
  const [linkingKey, setLinkingKey] = useState<string | null>(null)
  const ranCreateRef = useRef(false)
  const ranOsmSearchRef = useRef(false)

  const searchCreate = useSearchCreateCourse()
  const osmSearch = useOsmSearch()
  const osmLink = useOsmLinkClub()

  // Step 1: create on mount
  useEffect(() => {
    if (!isOpen || ranCreateRef.current) return
    ranCreateRef.current = true
    searchCreate.mutateAsync({ name: candidate.name, google_place_id: candidate.place_id })
      .then(result => {
        setCreated(result)
        setStep('review')
      })
      .catch((e: Error) => {
        setCreateError(e.message || 'Failed to create course')
        setStep('review')
      })
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 3: auto-fire OSM search when arriving there
  useEffect(() => {
    if (step !== 'osm' || ranOsmSearchRef.current) return
    ranOsmSearchRef.current = true
    runOsmSearch(osmQuery)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const runOsmSearch = async (q: string) => {
    const query = q.trim()
    if (!query) return
    setOsmError(null)
    try {
      const results = await osmSearch.mutateAsync({
        query,
        near_lat: candidate.lat,
        near_lng: candidate.lng,
      })
      setOsmResults(results)
    } catch (e) {
      setOsmResults([])
      setOsmError((e as Error).message || 'OSM search failed')
    }
  }

  const handleLink = async (r: OsmSearchResult) => {
    if (!created?.golf_club_id) return
    setOsmError(null)
    const key = `${r.osm_type}-${r.osm_id}`
    setLinkingKey(key)
    try {
      await osmLink.mutateAsync({
        clubId: created.golf_club_id,
        osmId: r.osm_id,
        osmType: r.osm_type,
      })
      setOsmLinked(true)
    } catch (e) {
      setOsmError((e as Error).message || 'Failed to link')
    } finally {
      setLinkingKey(null)
    }
  }

  const handleFinish = () => {
    if (created?.golf_club_id) onComplete(created.golf_club_id)
    else onCancel()
  }

  if (!isOpen) return null

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <div className={s.header}>
          <h3 className={s.title}>
            {step === 'creating' ? 'Creating course…' :
             step === 'review' ? 'Course details synced' :
             'Link map geometry'}
          </h3>
          <button className={s.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={s.body}>
          <div className={s.stepIndicator}>
            <span className={`${s.dot} ${step === 'creating' ? s.dotActive : s.dotDone}`} />
            <span className={`${s.dot} ${step === 'review' ? s.dotActive : step === 'creating' ? '' : s.dotDone}`} />
            <span className={`${s.dot} ${step === 'osm' ? s.dotActive : ''}`} />
            <span>
              {step === 'creating' && 'Creating...'}
              {step === 'review' && 'Review tee/hole data'}
              {step === 'osm' && 'Optionally link map geometry'}
            </span>
          </div>

          {step === 'creating' && (
            <div className={s.spinRow}>
              <Loader2 size={20} className={s.spin} />
              Adding {candidate.name}…
            </div>
          )}

          {step === 'review' && (
            <>
              {createError ? (
                <div className={`${s.syncResult} ${s.syncResultWarn}`}>
                  <div className={s.syncRow}>
                    <AlertTriangle size={18} color="var(--danger, #ef4444)" />
                    <span>Couldn't create course: {createError}</span>
                  </div>
                </div>
              ) : (
                <div className={`${s.syncResult} ${(created?.tees_synced ?? 0) > 0 ? s.syncResultSuccess : s.syncResultWarn}`}>
                  <div className={s.syncRow}>
                    {(created?.tees_synced ?? 0) > 0 ? (
                      <CheckCircle size={18} color="var(--accent)" />
                    ) : (
                      <AlertTriangle size={18} color="var(--danger, #ef4444)" />
                    )}
                    <strong>{created?.club_name || candidate.name}</strong>
                  </div>
                  {created?.address && (
                    <div className={s.syncLabel}>{created.address}</div>
                  )}
                  <div className={s.syncRow}>
                    <span className={s.syncLabel}>Tees synced:</span>
                    <span>{created?.tees_synced ?? 0}</span>
                    <span className={s.syncLabel} style={{ marginLeft: 12 }}>Holes:</span>
                    <span>{created?.holes_populated ?? 0}</span>
                  </div>
                  {(created?.tees_synced ?? 0) === 0 && (
                    <div className={s.syncLabel}>
                      Golf Course API had no data for this course. You can fill in tees and holes manually later.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 'osm' && (
            <>
              {osmLinked ? (
                <div className={s.successText}>
                  <Check size={18} />
                  Map geometry linked. You can now use the course map.
                </div>
              ) : (
                <>
                  <div className={s.syncLabel}>
                    OSM (OpenStreetMap) provides tee, green, and fairway geometry so the course map can render. Pick a match below, or skip — you can always link later from the club's detail page.
                  </div>
                  <div className={s.searchRow}>
                    <Input
                      value={osmQuery}
                      onChange={e => setOsmQuery(e.target.value)}
                      placeholder="Search OSM…"
                      onKeyDown={e => { if (e.key === 'Enter') runOsmSearch(osmQuery) }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => runOsmSearch(osmQuery)}
                      disabled={osmSearch.isPending || !osmQuery.trim()}
                    >
                      {osmSearch.isPending ? <Loader2 size={14} className={s.spin} /> : 'Search'}
                    </Button>
                  </div>
                  {osmError && <div className={s.errorText}>{osmError}</div>}
                  <div className={s.resultsList}>
                    {osmSearch.isPending && <div className={s.syncLabel}>Searching…</div>}
                    {!osmSearch.isPending && osmResults.length === 0 && (
                      <div className={s.syncLabel}>No results. Try a shorter or different name.</div>
                    )}
                    {osmResults.map(r => {
                      const key = `${r.osm_type}-${r.osm_id}`
                      const isThisLinking = linkingKey === key
                      return (
                        <div key={key} className={s.resultItem}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className={s.resultName}>{r.name || r.display_name}</div>
                            <div className={s.resultMeta}>
                              {r.osm_type}/{r.osm_id}
                              {r.distance_miles != null && ` • ${r.distance_miles.toFixed(1)} mi`}
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleLink(r)}
                            disabled={linkingKey !== null}
                          >
                            {isThisLinking ? <Loader2 size={14} className={s.spin} /> : 'Link'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className={s.footer}>
          {step === 'review' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleFinish}>Skip</Button>
              <Button
                variant="primary"
                size="sm"
                className={s.footerEnd}
                onClick={() => setStep('osm')}
                disabled={!created?.golf_club_id}
              >
                Continue
              </Button>
            </>
          )}
          {step === 'osm' && (
            <>
              {!osmLinked && (
                <Button variant="ghost" size="sm" onClick={handleFinish}>
                  Skip — I'll do this later
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                className={s.footerEnd}
                onClick={handleFinish}
              >
                Done
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
