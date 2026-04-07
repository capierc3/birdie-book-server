import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, Select, Button, EmptyState } from '../../components'
import { useClubs } from '../../api'
import type { Club } from '../../api'
import { ClubDistanceTable } from './ClubDistanceTable'
import { ClubBoxPlot } from './ClubBoxPlot'
import { ClubEditModal } from './ClubEditModal'
import { ClubMergeModal } from './ClubMergeModal'
import styles from '../../styles/pages.module.css'

type DataSource = 'course' | 'range' | 'combined'

function getCompareOptions(source: DataSource): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [
    { value: '', label: 'All Time' },
    { value: 'source:range', label: 'Range Data' },
    { value: 'source:course', label: 'Course Data' },
  ]

  if (source === 'course') {
    opts.push(
      { value: 'rounds:1', label: 'Last Round' },
      { value: 'rounds:3', label: 'Last 3 Rounds' },
      { value: 'rounds:5', label: 'Last 5 Rounds' },
      { value: 'rounds:10', label: 'Last 10 Rounds' },
      { value: 'rounds:20', label: 'Last 20 Rounds' },
    )
  } else if (source === 'range') {
    opts.push(
      { value: 'sessions:1', label: 'Last Session' },
      { value: 'sessions:3', label: 'Last 3 Sessions' },
      { value: 'sessions:5', label: 'Last 5 Sessions' },
      { value: 'sessions:10', label: 'Last 10 Sessions' },
    )
  } else {
    opts.push(
      { value: 'rounds:1', label: 'Last Round' },
      { value: 'rounds:3', label: 'Last 3 Rounds' },
      { value: 'rounds:6', label: 'Last 6 Rounds' },
      { value: 'sessions:1', label: 'Last Session' },
      { value: 'sessions:3', label: 'Last 3 Sessions' },
      { value: 'sessions:6', label: 'Last 6 Sessions' },
    )
  }

  opts.push(
    { value: 'months:1', label: 'Last Month' },
    { value: 'months:3', label: 'Last 3 Months' },
    { value: 'months:6', label: 'Last 6 Months' },
  )

  return opts
}

function parseWindow(compareWindow: string): { windowType: string; windowValue: number } | null {
  if (!compareWindow || compareWindow.startsWith('source:')) return null
  const [type, val] = compareWindow.split(':')
  return { windowType: type, windowValue: parseInt(val, 10) }
}

export function ClubsPage() {
  const navigate = useNavigate()
  const [dataSource, setDataSource] = useState<DataSource>('combined')
  const [compareWindow, setCompareWindow] = useState('')
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [mergeTarget, setMergeTarget] = useState<Club | null>(null)

  const windowParams = useMemo(() => parseWindow(compareWindow), [compareWindow])
  const { data: clubs = [], isLoading } = useClubs(windowParams?.windowType, windowParams?.windowValue)

  const compareOptions = useMemo(() => getCompareOptions(dataSource), [dataSource])

  const handleDataSourceChange = (src: DataSource) => {
    setDataSource(src)
    setCompareWindow('')
  }

  if (isLoading) return <div className={styles.loading}>Loading...</div>
  if (clubs.length === 0) {
    return (
      <div>
        <div className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className={styles.pageTitle}>My Bag</h1>
          <Button variant="primary" size="sm" onClick={() => setEditModalOpen(true)}>Add Club</Button>
        </div>
        <EmptyState message="No clubs found" description="Import rounds or range sessions to populate your bag." />
        <ClubEditModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} />
      </div>
    )
  }

  const compareLabel = compareOptions.find((o) => o.value === compareWindow)?.label ?? ''

  return (
    <div>
      <div className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.pageTitle}>My Bag</h1>
        <Button variant="primary" size="sm" onClick={() => setEditModalOpen(true)}>Add Club</Button>
      </div>

      <Card>
        <CardHeader title="Club Distances" action={
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Data:</label>
              <Select
                value={dataSource}
                onChange={(e) => handleDataSourceChange(e.target.value as DataSource)}
                style={{ width: 'auto' }}
              >
                <option value="course">On-Course</option>
                <option value="range">Range</option>
                <option value="combined">Combined</option>
              </Select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Compare to:</label>
              <Select
                value={compareWindow}
                onChange={(e) => setCompareWindow(e.target.value)}
                style={{ width: 'auto' }}
              >
                {compareOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
        } />
        <ClubDistanceTable
          clubs={clubs}
          dataSource={dataSource}
          compareWindow={compareWindow}
          onRowClick={(club) => navigate(`/clubs/${club.id}`)}
          onMerge={(club) => setMergeTarget(club)}
        />
      </Card>

      <div style={{ marginTop: 24 }}>
        <ClubBoxPlot clubs={clubs} dataSource={dataSource} compareWindow={compareWindow} compareLabel={compareLabel} />
      </div>

      <ClubEditModal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} />
      <ClubMergeModal
        isOpen={mergeTarget !== null}
        onClose={() => setMergeTarget(null)}
        targetClub={mergeTarget}
        allClubs={clubs}
      />
    </div>
  )
}
