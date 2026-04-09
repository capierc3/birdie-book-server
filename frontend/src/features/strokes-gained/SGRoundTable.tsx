import { useNavigate } from 'react-router-dom'
import { DataTable, MobileCardList } from '../../components'
import type { Column } from '../../components'
import type { SGPerRound } from '../../api'
import { formatDate, formatSG, sgColor } from '../../utils/format'
import { SG_LABELS } from '../../utils/chartTheme'
import { useIsMobile } from '../../hooks/useMediaQuery'

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

function sgVal(cat: { sg_pga: number; sg_personal: number } | null | undefined, baseline: 'pga' | 'personal') {
  if (!cat) return null
  return baseline === 'pga' ? cat.sg_pga : cat.sg_personal
}

export function SGRoundTable({ rounds, baseline }: Props) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <MobileCardList
        data={rounds}
        keyExtractor={(r) => r.round_id}
        onCardClick={(r) => navigate(`/rounds/${r.round_id}`)}
        emptyMessage="No strokes gained data"
        renderCard={(r) => {
          const total = baseline === 'pga' ? r.total_sg_pga : r.total_sg_personal
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.course_name ?? '--'}</div>
                <span style={{ color: sgColor(total), fontWeight: 700, fontSize: '1rem' }}>
                  {formatSG(total)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {formatDate(r.date)}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: '0.78rem' }}>
                {(['off_the_tee', 'approach', 'short_game', 'putting'] as const).map((cat) => {
                  const val = sgVal(r[cat], baseline)
                  return (
                    <span key={cat} style={{ color: sgColor(val) }}>
                      {SG_LABELS[cat]?.slice(0, 3)}: {formatSG(val)}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        }}
      />
    )
  }

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
