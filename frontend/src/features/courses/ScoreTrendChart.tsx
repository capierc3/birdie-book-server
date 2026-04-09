import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { Card, CardHeader } from '../../components'
import type { CourseRoundStats } from '../../api'
import { CHART_COLORS } from '../../utils/chartTheme'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface Props {
  rounds: CourseRoundStats[]
}

const AVG_COLOR = '#3b82f6'
const RAW_COLOR = '#94a3b8'

function dateToEpoch(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getTime()
}

function formatEpoch(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function formatEpochFull(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function ScoreTrendChart({ rounds }: Props) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const sorted = useMemo(
    () => [...rounds].sort((a, b) => a.date.localeCompare(b.date)),
    [rounds],
  )

  const chartData = useMemo(() => {
    let cumSum = 0
    let cumCount = 0
    return sorted.map((r) => {
      cumSum += r.vs_par_per_hole
      cumCount += 1
      return {
        x: dateToEpoch(r.date),
        raw: Math.round(r.vs_par_per_hole * 100) / 100,
        avg: Math.round((cumSum / cumCount) * 100) / 100,
        roundId: r.round_id,
      }
    })
  }, [sorted])

  if (sorted.length < 2) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (data: any) => {
    const roundId = data?.activePayload?.[0]?.payload?.roundId
    if (roundId) navigate(`/rounds/${roundId}`)
  }

  return (
    <Card>
      <CardHeader title="Score Trend" />

      <div style={{ display: 'flex', gap: 16, padding: '0 20px 8px', fontSize: '0.78rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 16, height: 2.5, background: AVG_COLOR, display: 'inline-block' }} />
          Cumulative Avg vs Par
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 16, height: 0, borderTop: '2px dashed ' + RAW_COLOR, display: 'inline-block' }} />
          Per-Round vs Par
        </span>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <ComposedChart data={chartData} margin={{ left: 10, right: 10 }} onClick={handleClick}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            scale="time"
            tickFormatter={formatEpoch}
            stroke={CHART_COLORS.text}
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            stroke={CHART_COLORS.text}
            fontSize={11}
            tickLine={false}
            tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.text} strokeDasharray="3 3" />
          <Tooltip
            contentStyle={{
              background: CHART_COLORS.tooltip.bg,
              border: `1px solid ${CHART_COLORS.tooltip.border}`,
              borderRadius: 6,
              color: CHART_COLORS.tooltip.text,
              fontSize: '0.82rem',
            }}
            labelFormatter={(v: number) => formatEpochFull(v)}
            formatter={(value: number, name: string) => {
              const f = value != null ? (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2)) : '--'
              return [f, name]
            }}
          />
          <Legend content={() => null} />

          <Area
            type="monotone"
            dataKey="avg"
            name="Cumulative Avg"
            stroke={AVG_COLOR}
            strokeWidth={2.5}
            fill={AVG_COLOR}
            fillOpacity={0.15}
            dot={{ r: 3, fill: AVG_COLOR }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="raw"
            name="Per-Round vs Par"
            stroke={RAW_COLOR}
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={{ r: 2, fill: RAW_COLOR }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748b', padding: '4px 0 0' }}>
        Values shown as &plusmn; par per hole
      </div>
    </Card>
  )
}
