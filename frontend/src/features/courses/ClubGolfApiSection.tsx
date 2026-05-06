import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button, Input, ResponsiveSelect, StatusMessage } from '../../components'
import { useGolfApiSearch, useApplyGolfApiMatch } from '../../api'
import type { GolfClubSummary, CourseDetail, GolfApiSearchResult } from '../../api'
import cs from './ClubDetailPage.module.css'

interface Props {
  club: GolfClubSummary
  courseDetails: CourseDetail[]
}

/** Manual Golf Course API search — counterpart to ClubOsmSection. Lets the
 * user pick a course explicitly when auto-sync (in CourseSearchCreate or club
 * sync) didn't find a match or pulled the wrong one. Each result can be
 * applied to a specific course at this club, which (re)imports tees + holes. */
export function ClubGolfApiSection({ club, courseDetails }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState(
    club.name.replace(/\s*(golf\s*)?(club|course|links|resort)\s*$/i, ''),
  )
  const [results, setResults] = useState<GolfApiSearchResult[]>([])
  const [searchError, setSearchError] = useState('')
  const [statusMsg, setStatusMsg] = useState('')

  const search = useGolfApiSearch()
  const applyMatch = useApplyGolfApiMatch()

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchError('')
    setStatusMsg('')
    try {
      const data = await search.mutateAsync({
        query: searchQuery.trim(),
        club_id: club.id,
      })
      setResults(data.results)
      if (data.error) {
        setSearchError(data.error)
      } else if (data.results.length === 0) {
        setSearchError('No courses found in the Golf Course API for that query.')
      }
    } catch (e) {
      setResults([])
      setSearchError(e instanceof Error ? e.message : 'Search failed')
    }
  }

  const handleApply = async (courseId: number, apiId: number) => {
    setStatusMsg('Applying tees and holes from the Golf Course API...')
    try {
      const res = await applyMatch.mutateAsync({ courseId, apiId })
      if (res.status === 'error') {
        setStatusMsg(`Failed: ${res.reason ?? 'unknown error'}`)
        return
      }
      const teesCount = res.tees_created ?? 0
      const matched = res.rounds_matched_to_tees ?? 0
      const teeWord = teesCount === 1 ? 'tee' : 'tees'
      const matchedFragment = matched > 0 ? `, matched ${matched} round${matched === 1 ? '' : 's'}` : ''
      if (teesCount === 0) {
        setStatusMsg('Applied — but the Golf Course API returned 0 tees for this course.')
      } else {
        setStatusMsg(`Applied ${teesCount} ${teeWord}${matchedFragment}.`)
      }
      setTimeout(() => setStatusMsg(''), 6000)
    } catch (e) {
      setStatusMsg(`Failed: ${e instanceof Error ? e.message : 'apply failed'}`)
    }
  }

  return (
    <div className={cs.osmSection}>
      <div className={cs.osmToggle} onClick={() => setExpanded(!expanded)}>
        <span className={cs.osmToggleTitle}>Golf Course API</span>
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </div>

      {expanded && (
        <div className={cs.osmBody}>
          <div className={cs.osmSearchRow}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Golf Course API..."
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button size="sm" onClick={handleSearch} disabled={search.isPending}>
              {search.isPending ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchError && (
            <div style={{ marginTop: 8 }}>
              <StatusMessage variant="error">{searchError}</StatusMessage>
            </div>
          )}

          {results.length > 0 && (
            <div className={cs.osmResults}>
              {results.map((r) => (
                <div key={r.api_id} className={cs.osmResultItem}>
                  <div>
                    <div className={cs.osmResultName}>
                      {r.club_name}
                      {r.course_name && r.course_name !== r.club_name ? ` — ${r.course_name}` : ''}
                    </div>
                    <div className={cs.osmResultSub}>
                      {[r.city, r.state, r.country].filter(Boolean).join(', ')}
                      {r.distance_miles != null ? ` · ${r.distance_miles.toFixed(1)} mi` : ''}
                    </div>
                  </div>
                  {courseDetails.length === 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleApply(courseDetails[0].id, r.api_id)}
                      disabled={applyMatch.isPending}
                    >
                      Apply
                    </Button>
                  ) : (
                    <ResponsiveSelect
                      value=""
                      onChange={(v) => {
                        if (!v) return
                        handleApply(Number(v), r.api_id)
                      }}
                      options={[
                        { value: '', label: 'Apply to...' },
                        ...courseDetails.map((cd) => ({
                          value: String(cd.id),
                          label: cd.course_name ?? cd.display_name,
                        })),
                      ]}
                      title="Apply to course"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {statusMsg && (
            <div style={{ marginTop: 8 }}>
              <StatusMessage variant={statusMsg.startsWith('Failed') ? 'error' : statusMsg.endsWith('...') ? 'progress' : 'success'}>
                {statusMsg}
              </StatusMessage>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
