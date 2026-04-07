import { useNavigate } from 'react-router-dom'
import { DataTable } from '../../components'
import type { Column } from '../../components'
import type { SGPerRound } from '../../api'
import { formatDate, formatSG, sgColor } from '../../utils/format'

interface Props {
  rounds: SGPerRound[]
  baseline: 'pga' | 'personal'
}

function sgCell(val: number | null | undefined) {
  return (
    <span style={{ color: sgColor(val), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      {formatSG(val)}
    </span>
  )
}

export function SGRoundTable({ rounds, baseline }: Props) {
  const navigate = useNavigate()

  const columns: Column<SGPerRound>[] = [
    { key: 'date', header: 'Date', sortable: true, render: (r) => formatDate(r.date) },
    { key: 'course_name', header: 'Course', sortable: true, render: (r) => r.course_name ?? '--' },
    {
      key: 'off_the_tee', header: 'OTT', align: 'center', sortable: true,
      render: (r) => sgCell(baseline === 'pga' ? r.off_the_tee?.sg_pga : r.off_the_tee?.sg_personal),
    },
    {
      key: 'approach', header: 'APP', align: 'center', sortable: true,
      render: (r) => sgCell(baseline === 'pga' ? r.approach?.sg_pga : r.approach?.sg_personal),
    },
    {
      key: 'short_game', header: 'SG', align: 'center', sortable: true,
      render: (r) => sgCell(baseline === 'pga' ? r.short_game?.sg_pga : r.short_game?.sg_personal),
    },
    {
      key: 'putting', header: 'PUTT', align: 'center', sortable: true,
      render: (r) => sgCell(baseline === 'pga' ? r.putting?.sg_pga : r.putting?.sg_personal),
    },
    {
      key: 'total', header: 'Total', align: 'center', sortable: true,
      render: (r) => sgCell(baseline === 'pga' ? r.total_sg_pga : r.total_sg_personal),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={rounds}
      keyExtractor={(r) => r.round_id}
      onRowClick={(r) => navigate(`/rounds/${r.round_id}`)}
      emptyMessage="No strokes gained data"
    />
  )
}
