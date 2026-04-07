import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, DataTable, Button, EmptyState } from '../../components'
import type { Column } from '../../components'
import { useRangeSessions, useDeleteRangeSession } from '../../api'
import type { RangeSessionSummary } from '../../api'
import { formatDate, formatDateTime } from '../../utils/format'
import styles from '../../styles/pages.module.css'

const SOURCE_LABELS: Record<string, string> = {
  rapsodo_mlm2pro: 'Rapsodo MLM2PRO',
  trackman: 'Trackman',
}

type SortDir = 'asc' | 'desc'

export function RangePage() {
  const navigate = useNavigate()
  const { data: sessions = [], isLoading } = useRangeSessions()
  const deleteMutation = useDeleteRangeSession()

  const [sortKey, setSortKey] = useState('session_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const sorted = useMemo(() => {
    const list = [...sessions]
    list.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey]
      const bv = (b as unknown as Record<string, unknown>)[sortKey]
      let cmp = 0
      if (typeof av === 'string' && typeof bv === 'string') {
        cmp = av.localeCompare(bv)
      } else {
        cmp = ((av as number) ?? 0) - ((bv as number) ?? 0)
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return list
  }, [sessions, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'session_date' ? 'desc' : 'asc')
    }
  }

  const handleDelete = (e: React.MouseEvent, session: RangeSessionSummary) => {
    e.stopPropagation()
    if (!confirm(`Delete session from ${formatDate(session.session_date)}? This cannot be undone.`)) return
    deleteMutation.mutate(session.id)
  }

  const columns: Column<RangeSessionSummary>[] = [
    {
      key: 'session_date',
      header: 'Date',
      sortable: true,
      render: (r) => formatDateTime(r.session_date),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      render: (r) => SOURCE_LABELS[r.source] ?? r.source,
    },
    {
      key: 'shot_count',
      header: 'Shots',
      sortable: true,
      align: 'center',
    },
    {
      key: 'title',
      header: 'Title',
      render: (r) => r.title ?? '\u2014',
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => handleDelete(e, r)}
          title="Delete session"
          style={{ color: 'var(--danger, #ef4444)' }}
        >
          &#128465;
        </Button>
      ),
    },
  ]

  if (isLoading) return <div className={styles.loading}>Loading...</div>

  return (
    <div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Range Sessions</h1>
        <p className={styles.pageDesc}>Launch monitor practice data</p>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          message="No range sessions yet"
          description="Import MLM2PRO or Trackman data to get started."
        />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            data={sorted}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => navigate(`/range/${r.id}`)}
            sortKey={sortKey}
            sortDirection={sortDir}
            onSort={handleSort}
            emptyMessage="No range sessions"
          />
        </Card>
      )}
    </div>
  )
}
