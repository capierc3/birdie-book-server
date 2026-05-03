import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ReferenceLine, Legend,
} from 'recharts'
import { Card, CardHeader, ResponsiveSelect } from '../../components'
import type { ScoringRound } from '../../api'
import { CHART_COLORS } from '../../utils/chartTheme'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface Props {
  rounds: ScoringRound[]
}

type AxisMode = 'rounds' | 'date'
type RangeValue = '5' | '10' | '20' | 'all' | '1m' | '3m' | '6m' | '1y'

function dateToEpoch(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getTime()
}

function formatEpoch(epoch: number): string {
  const d = new Date(epoch)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatEpochFull(epoch: number): string {
  const d = new Date(epoch)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

const AVG_COLOR = '#3b82f6'
const RAW_COLOR = '#94a3b8'

export function ScoreOverTimeChart({ rounds }: Props) {
  const isMobile = useIsMobile()
  const [axisMode, setAxisMode] = useState<AxisMode>('rounds')
  const [rangeValue, setRangeValue] = useState<RangeValue>('all')

  const handleAxisChange = (mode: AxisMode) => {
    setAxisMode(mode)
    setRangeValue('all')
  }

  const isDateMode = axisMode === 'date'

  // Sort rounds chronologically (oldest first for chart)
  const sorted = useMemo(() =>
    [...rounds].sort((a, b) => a.date.localeCompare(b.date)),
    [rounds],
  )

  const chartData = useMemo(() => {
    if (sorted.length === 0) return []

    if (!isDateMode) {
      const sliced = rangeValue === 'all'
        ? sorted
        : sorted.slice(-(parseInt(rangeValue) || sorted.length))

      let cumSum = 0
      let cumCount = 0
      return sliced.map((r, i) => {
        cumSum += r.score_vs_par
        cumCount += 1
        return {
          x: `R${i + 1}`,
          raw: r.score_vs_par,
          avg: Math.round((cumSum / cumCount) * 100) / 100,
          roundId: r.round_id,
        }
      })
    }

    // Date mode
    let cumSum = 0
    let cumCount = 0
    const allPoints = sorted.map((r) => {
      cumSum += r.score_vs_par
      cumCount += 1
      return {
        x: dateToEpoch(r.date),
        raw: r.score_vs_par,
        avg: Math.round((cumSum / cumCount) * 100) / 100,
        roundId: r.round_id,
      }
    })

    if (rangeValue !== 'all') {
      const now = new Date()
      let cutoff: Date
      switch (rangeValue) {
        case '1m': cutoff = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break
        case '3m': cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break
        case '6m': cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break
        case '1y': cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break
        default: return allPoints
      }
      const cutoffEpoch = dateToEpoch(cutoff.toISOString().slice(0, 10))
      const visible = allPoints.filter((p) => (p.x as number) >= cutoffEpoch)
      const anchor = allPoints.filter((p) => (p.x as number) < cutoffEpoch).pop()
      return anchor ? [anchor, ...visible] : visible
    }

    return allPoints
  }, [sorted, isDateMode, rangeValue])

  if (sorted.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Score Over Time"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ResponsiveSelect
              value={axisMode}
              onChange={(v) => handleAxisChange(v as AxisMode)}
              options={[
                { value: 'rounds', label: 'By Round' },
                { value: 'date', label: 'By Date' },
              ]}
              title="Axis"
            />
            <ResponsiveSelect
              value={rangeValue}
              onChange={(v) => setRangeValue(v as RangeValue)}
              options={!isDateMode ? [
                { value: '5', label: 'Last 5 Rounds' },
                { value: '10', label: 'Last 10 Rounds' },
                { value: '20', label: 'Last 20 Rounds' },
                { value: 'all', label: 'All Rounds' },
              ] : [
                { value: '1m', label: '1 Month' },
                { value: '3m', label: '3 Months' },
                { value: '6m', label: '6 Months' },
                { value: '1y', label: '1 Year' },
                { value: 'all', label: 'All Time' },
              ]}
              title="Range"
            />
          </div>
        }
      />

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, padding: '0 20px 8px', fontSize: '0.78rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 16, height: 2.5, background: AVG_COLOR, display: 'inline-block' }} />
          Cumulative Avg vs Par
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 16, height: 0, borderTop: '2px dashed ' + RAW_COLOR, display: 'inline-block' }} />
          Score vs Par
        </span>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <LineChart data={chartData} margin={{ left: 10, right: 10 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type={isDateMode ? 'number' : 'category'}
            domain={isDateMode ? ['dataMin', 'dataMax'] : undefined}
            scale={isDateMode ? 'time' : undefined}
            tickFormatter={isDateMode ? formatEpoch : undefined}
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
            labelFormatter={isDateMode ? (v: number) => formatEpochFull(v) : undefined}
            formatter={(value: number, name: string) => {
              const formatted = value != null ? (value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1)) : '--'
              return [formatted, name]
            }}
          />
          <Legend content={() => null} />

          {/* Cumulative avg line (solid) */}
          <Line
            type="monotone"
            dataKey="avg"
            name="Cumulative Avg vs Par"
            stroke={AVG_COLOR}
            strokeWidth={2.5}
            dot={{ r: 3, fill: AVG_COLOR }}
            connectNulls
            isAnimationActive={false}
          />

          {/* Per-round line (dashed) */}
          <Line
            type="monotone"
            dataKey="raw"
            name="Score vs Par"
            stroke={RAW_COLOR}
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={{ r: 2, fill: RAW_COLOR }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
