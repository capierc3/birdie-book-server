import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend,
} from 'recharts'
import { Card, CardHeader, ResponsiveSelect } from '../../components'
import type { ScoringRound } from '../../api'
import { SCORE_DIST_COLORS, CHART_COLORS } from '../../utils/chartTheme'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface Props {
  rounds: ScoringRound[]
}

type AxisMode = 'rounds' | 'date'
type RangeValue = '5' | '10' | '20' | 'all' | '1m' | '3m' | '6m' | '1y'

const CATEGORIES = [
  { key: 'birdie_pct', label: 'Birdie+', color: SCORE_DIST_COLORS.birdie_or_better },
  { key: 'par_pct', label: 'Par', color: SCORE_DIST_COLORS.par },
  { key: 'bogey_pct', label: 'Bogey', color: SCORE_DIST_COLORS.bogey },
  { key: 'double_pct', label: 'Double', color: SCORE_DIST_COLORS.double },
  { key: 'triple_pct', label: 'Triple+', color: SCORE_DIST_COLORS.triple_plus },
] as const

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

/** Compute per-round distribution percentages (each round independently) */
function perRoundDistribution(rounds: ScoringRound[]) {
  return rounds.map((r) => {
    const total = r.birdie_or_better + r.pars + r.bogeys + r.doubles + r.triple_plus
    if (total === 0) return { birdie_pct: 0, par_pct: 0, bogey_pct: 0, double_pct: 0, triple_pct: 0 }
    return {
      birdie_pct: Math.round((r.birdie_or_better / total) * 1000) / 10,
      par_pct: Math.round((r.pars / total) * 1000) / 10,
      bogey_pct: Math.round((r.bogeys / total) * 1000) / 10,
      double_pct: Math.round((r.doubles / total) * 1000) / 10,
      triple_pct: Math.round((r.triple_plus / total) * 1000) / 10,
    }
  })
}

export function ScoringTrendChart({ rounds }: Props) {
  const isMobile = useIsMobile()
  const [axisMode, setAxisMode] = useState<AxisMode>('rounds')
  const [rangeValue, setRangeValue] = useState<RangeValue>('all')

  const handleAxisChange = (mode: AxisMode) => {
    setAxisMode(mode)
    setRangeValue('all')
  }

  const isDateMode = axisMode === 'date'

  // Sort chronologically
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

      const distData = perRoundDistribution(sliced)
      return sliced.map((r, i) => ({
        x: `R${i + 1}`,
        roundId: r.round_id,
        ...distData[i],
      }))
    }

    // Date mode
    const distData = perRoundDistribution(sorted)
    const allPoints = sorted.map((r, i) => ({
      x: dateToEpoch(r.date),
      roundId: r.round_id,
      ...distData[i],
    }))

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
        title="Scoring Trend"
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
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '0 20px 8px', fontSize: '0.78rem' }}>
        {CATEGORIES.map(({ key, label, color }) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 12, background: color, borderRadius: 2, display: 'inline-block' }} />
            {label}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 220 : 300}>
        <AreaChart data={chartData} margin={{ left: 10, right: 10 }}>
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
            domain={[0, 100]}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
          />
          <Tooltip
            contentStyle={{
              background: CHART_COLORS.tooltip.bg,
              border: `1px solid ${CHART_COLORS.tooltip.border}`,
              borderRadius: 6,
              color: CHART_COLORS.tooltip.text,
              fontSize: '0.82rem',
            }}
            labelFormatter={isDateMode ? (v: number) => formatEpochFull(v) : undefined}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
          />
          <Legend content={() => null} />

          {/* Stacked areas — render bottom-to-top (triple first so birdie is on top) */}
          {[...CATEGORIES].reverse().map(({ key, label, color }) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={label}
              stackId="1"
              stroke={color}
              fill={color}
              fillOpacity={0.85}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
