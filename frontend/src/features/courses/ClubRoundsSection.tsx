import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, DataTable, Badge } from '../../components'
import type { Column } from '../../components'
import { useRounds, useUpdateRoundTee } from '../../api'
import type { RoundSummary, CourseDetail } from '../../api'
import { formatDate, formatVsPar, vsParColor } from '../../utils/format'
import cs from './ClubDetailPage.module.css'

interface Props {
  courseIds: number[]
  courseDetails: CourseDetail[]
}

export function ClubRoundsSection({ courseIds, courseDetails }: Props) {
  const navigate = useNavigate()
  const { data: allRounds = [] } = useRounds()
  const updateTee = useUpdateRoundTee()

  const courseIdSet = useMemo(() => new Set(courseIds), [courseIds])

  const rounds = useMemo(
    () => allRounds
      .filter((r) => r.course_id != null && courseIdSet.has(r.course_id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [allRounds, courseIdSet],
  )

  // Build tee lookup: courseId → tees
  const teeLookup = useMemo(() => {
    const map = new Map<number, { id: number; tee_name: string }[]>()
    for (const cd of courseDetails) {
      map.set(
        cd.id,
        cd.tees.map((t) => ({ id: t.id, tee_name: t.tee_name ?? `Tee #${t.id}` })),
      )
    }
    return map
  }, [courseDetails])

  const handleTeeChange = (roundId: number, teeId: number) => {
    updateTee.mutate({ roundId, teeId })
  }

  const columns: Column<RoundSummary>[] = [
    {
      key: 'total_strokes',
      header: 'Score',
      align: 'center',
      render: (r) => (
        <span className={`${cs.roundScore} ${vsParColor(r.score_vs_par)}`}>
          {r.total_strokes ?? '--'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (r) => formatDate(r.date),
    },
    {
      key: 'course_name',
      header: 'Course',
      render: (r) => r.course_name ?? '--',
    },
    {
      key: 'holes_completed',
      header: 'Holes',
      align: 'center',
    },
    {
      key: 'shots_tracked',
      header: 'Shots',
      align: 'center',
      render: (r) => r.shots_tracked ?? '--',
    },
    {
      key: 'source',
      header: 'Source',
      render: (r) => r.source ?? '--',
    },
    {
      key: 'tee',
      header: 'Tee',
      render: (r) => {
        const tees = r.course_id != null ? teeLookup.get(r.course_id) : undefined
        if (!tees || tees.length === 0) return r.tee_name ?? '--'
        return (
          <select
            className={cs.teeSelect}
            value={r.tee_id ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              if (e.target.value) handleTeeChange(r.id, Number(e.target.value))
            }}
          >
            <option value="">--</option>
            {tees.map((t) => (
              <option key={t.id} value={t.id}>{t.tee_name}</option>
            ))}
          </select>
        )
      },
    },
    {
      key: 'score_vs_par',
      header: 'vs Par',
      align: 'center',
      render: (r) => (
        <span className={vsParColor(r.score_vs_par)}>
          {formatVsPar(r.score_vs_par)}
        </span>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader
        title="Rounds"
        action={<Badge variant="green">{rounds.length}</Badge>}
      />
      <DataTable
        columns={columns}
        data={rounds}
        keyExtractor={(r) => r.id}
        onRowClick={(r) => navigate(`/rounds/${r.id}`)}
        emptyMessage="No rounds at this club"
      />
    </Card>
  )
}
