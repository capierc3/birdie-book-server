import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, CardHeader, DataTable, Button, Input, Badge, EmptyState } from '../../components'
import type { Column } from '../../components'
import { useGolfClubs, useSearchCreateCourse } from '../../api'
import type { GolfClubSummary, SearchCreateResult } from '../../api'
import styles from '../../styles/pages.module.css'
import cs from './CoursesPage.module.css'

type ClubCourse = GolfClubSummary['courses'][number]

function formatSlope(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return '--'
  if (min == null) return String(max)
  if (max == null) return String(min)
  if (min === max) return String(min)
  return `${min}\u2013${max}`
}

const courseColumns: Column<ClubCourse>[] = [
  {
    key: 'name',
    header: 'Course',
    render: (c) => c.name || '\u2014',
  },
  {
    key: 'holes',
    header: 'Holes',
    align: 'center',
    render: (c) => c.holes ?? '--',
  },
  {
    key: 'par',
    header: 'Par',
    align: 'center',
    render: (c) => c.par ?? '--',
  },
  {
    key: 'tee_count',
    header: 'Tees',
    align: 'center',
  },
  {
    key: 'slope',
    header: 'Slope',
    align: 'center',
    render: (c) => formatSlope(c.slope_min, c.slope_max),
  },
  {
    key: 'rounds_played',
    header: 'Rounds',
    align: 'center',
  },
]

export function CoursesPage() {
  const navigate = useNavigate()
  const { data: clubs = [], isLoading } = useGolfClubs()
  const searchCreate = useSearchCreateCourse()

  const [showAddPanel, setShowAddPanel] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [searchResult, setSearchResult] = useState<SearchCreateResult | null>(null)

  const sorted = useMemo(
    () => [...clubs].sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  )

  const handleSearch = async () => {
    const name = searchName.trim()
    if (!name) return
    setSearchResult(null)
    const result = await searchCreate.mutateAsync(name)
    setSearchResult(result)
  }

  const handleSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  if (isLoading) {
    return <div className={styles.loading}>Loading courses...</div>
  }

  return (
    <div>
      <div className={cs.headerRow}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Courses</h1>
          <p className={styles.pageDesc}>Your golf clubs and courses</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setShowAddPanel((v) => !v)
            setSearchResult(null)
          }}
        >
          <Plus size={16} /> Add Course
        </Button>
      </div>

      {showAddPanel && (
        <div className={cs.addPanel}>
          <div className={cs.searchRow}>
            <Input
              placeholder="Search for a course..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={handleSearchKey}
              autoFocus
            />
            <Button
              size="sm"
              onClick={handleSearch}
              disabled={searchCreate.isPending || !searchName.trim()}
            >
              {searchCreate.isPending ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchCreate.isError && (
            <div className={cs.searchError}>
              Search failed. Please try again.
            </div>
          )}

          {searchResult && (
            <div className={cs.searchResult}>
              <div className={cs.resultRow}>
                {searchResult.photo_url && (
                  <img
                    src={searchResult.photo_url}
                    alt=""
                    className={cs.resultPhoto}
                  />
                )}
                <div className={cs.resultInfo}>
                  <div className={cs.resultName}>
                    {searchResult.club_name}
                  </div>
                  <div className={cs.resultSub}>
                    {searchResult.status === 'existing'
                      ? `Already in your library \u00b7 ${searchResult.courses?.length ?? 0} course(s)`
                      : `Created \u00b7 ${searchResult.address ?? ''}`}
                  </div>
                </div>
                {searchResult.course_id != null && (
                  <span
                    className={cs.resultLink}
                    onClick={() => navigate(`/courses/${searchResult.course_id}`)}
                  >
                    View &rarr;
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          message="No courses yet"
          description="Import Garmin data to get started."
        />
      ) : (
        sorted.map((club) => (
          <div
            key={club.id}
            className={cs.clubCard}
            onClick={() => navigate(`/courses/club/${club.id}`)}
          >
            <Card>
              <CardHeader
                title={club.name}
                action={
                  <Badge variant="green">
                    {club.course_count} course{club.course_count !== 1 ? 's' : ''} &middot;{' '}
                    {club.total_rounds} round{club.total_rounds !== 1 ? 's' : ''}
                  </Badge>
                }
              />
              {club.address && (
                <div className={cs.clubAddress}>{club.address}</div>
              )}
              <div onClick={(e) => e.stopPropagation()}>
                <DataTable
                  columns={courseColumns}
                  data={club.courses}
                  keyExtractor={(c) => c.id}
                  onRowClick={(c) => navigate(`/courses/${c.id}`)}
                  emptyMessage="No courses at this club"
                />
              </div>
            </Card>
          </div>
        ))
      )}
    </div>
  )
}
