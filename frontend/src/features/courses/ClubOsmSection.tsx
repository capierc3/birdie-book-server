import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button, Input, Select, StatusMessage } from '../../components'
import { useOsmSearch, useOsmLinkClub, useOsmLinkCourse } from '../../api'
import type { GolfClubSummary, CourseDetail, OsmSearchResult } from '../../api'
import cs from './ClubDetailPage.module.css'

interface Props {
  club: GolfClubSummary
  courseDetails: CourseDetail[]
}

export function ClubOsmSection({ club, courseDetails }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState(
    club.name.replace(/\s*(golf\s*)?(club|course|links|resort)\s*$/i, ''),
  )
  const [results, setResults] = useState<OsmSearchResult[]>([])
  const osmSearch = useOsmSearch()
  const osmLinkClub = useOsmLinkClub()
  const osmLinkCourse = useOsmLinkCourse()
  const [statusMsg, setStatusMsg] = useState('')

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      const data = await osmSearch.mutateAsync({ query: searchQuery.trim() })
      setResults(data)
    } catch {
      setResults([])
    }
  }

  const handleLinkClub = async (osmId: number, osmType: string) => {
    try {
      await osmLinkClub.mutateAsync({ clubId: club.id, osmId, osmType })
      setResults([])
      setStatusMsg('Linked and imported features.')
      setTimeout(() => setStatusMsg(''), 5000)
    } catch {
      setStatusMsg('Failed to link.')
    }
  }

  const handleLinkCourse = async (courseId: number, osmId: number, osmType: string) => {
    try {
      await osmLinkCourse.mutateAsync({ courseId, osmId, osmType })
      setStatusMsg(`Linked course #${courseId}.`)
      setTimeout(() => setStatusMsg(''), 5000)
    } catch {
      setStatusMsg('Failed to link course.')
    }
  }

  const getOsmStatus = (cd: CourseDetail) => {
    const hasOsm = cd.osm_id != null
    const hasGeo = cd.tees.some((t) =>
      t.holes.some((h) => h.tee_lat != null || h.green_boundary != null),
    )
    if (hasOsm && hasGeo) return { icon: '\u2713\u2713', color: 'var(--accent)' }
    if (hasOsm) return { icon: '\u2713', color: 'var(--accent)' }
    if (hasGeo) return { icon: '\u2022', color: 'var(--info)' }
    return { icon: '\u2013', color: 'var(--text-dim)' }
  }

  const getDataCounts = (cd: CourseDetail) => {
    const numHoles = cd.holes ?? 18
    const teesWithData = cd.tees[0]?.holes.filter((h) => h.tee_lat != null).length ?? 0
    const greensWithData = cd.tees[0]?.holes.filter((h) => h.green_boundary != null).length ?? 0
    const fairwaysWithData = cd.tees[0]?.holes.filter((h) => h.fairway_path != null).length ?? 0
    return `${teesWithData}/${numHoles} tees, ${greensWithData}/${numHoles} greens, ${fairwaysWithData}/${numHoles} fairways`
  }

  return (
    <div className={cs.osmSection}>
      <div className={cs.osmToggle} onClick={() => setExpanded(!expanded)}>
        <span className={cs.osmToggleTitle}>OSM Course Data</span>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {expanded && (
        <div className={cs.osmBody}>
          {/* Club-level search */}
          <div className={cs.osmSearchRow}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search OSM..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button size="sm" onClick={handleSearch} disabled={osmSearch.isPending}>
              {osmSearch.isPending ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {results.length > 0 && (
            <div className={cs.osmResults}>
              {results.map((r) => (
                <div
                  key={`${r.osm_type}-${r.osm_id}`}
                  className={cs.osmResultItem}
                  onClick={() => handleLinkClub(r.osm_id, r.osm_type)}
                >
                  <div>
                    <div className={cs.osmResultName}>{r.name}</div>
                    <div className={cs.osmResultSub}>
                      {r.display_name}
                      {r.distance_miles != null ? ` \u00b7 ${r.distance_miles.toFixed(1)} mi` : ''}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Link</Button>
                </div>
              ))}
            </div>
          )}

          {statusMsg && (
            <div style={{ marginTop: 8 }}>
              <StatusMessage variant={statusMsg.startsWith('Failed') ? 'error' : 'success'}>
                {statusMsg}
              </StatusMessage>
            </div>
          )}

          {/* Per-course status */}
          <div style={{ marginTop: 16 }}>
            {courseDetails.map((cd) => {
              const status = getOsmStatus(cd)
              return (
                <div key={cd.id} className={cs.osmCourseRow}>
                  <span className={cs.osmStatus} style={{ color: status.color }}>
                    {status.icon}
                  </span>
                  <span className={cs.osmCourseName}>
                    {cd.course_name ?? cd.display_name}
                  </span>
                  <span className={cs.osmCourseData}>{getDataCounts(cd)}</span>
                  {cd.osm_id == null && results.length > 0 && (
                    <Select
                      style={{ width: 'auto', fontSize: '0.8rem' }}
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return
                        const [osmType, osmIdStr] = e.target.value.split(':')
                        handleLinkCourse(cd.id, Number(osmIdStr), osmType)
                      }}
                    >
                      <option value="">Link to...</option>
                      {results.map((r) => (
                        <option key={`${r.osm_type}:${r.osm_id}`} value={`${r.osm_type}:${r.osm_id}`}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
