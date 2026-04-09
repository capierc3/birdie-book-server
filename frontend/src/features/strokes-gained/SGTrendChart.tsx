import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { Card, CardHeader, Select } from '../../components'
import type { SGTrends } from '../../api'
import { SG_CATEGORIES, SG_COLORS, SG_LABELS, CHART_COLORS } from '../../utils/chartTheme'
import { formatDateShort } from '../../utils/format'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface Props {
  data: SGTrends
  baseline: 'pga' | 'personal'
}

type AxisMode = 'rounds' | 'date'
type RangeValue = '5' | '10' | '20' | 'all' | '1m' | '3m' | '6m' | '1y'

/** Parse "YYYY-MM-DD" to epoch ms (noon UTC to avoid DST issues) */
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

export function SGTrendChart({ data, baseline }: Props) {
  const isMobile = useIsMobile()
  const [axisMode, setAxisMode] = useState<AxisMode>('rounds')
  const [rangeValue, setRangeValue] = useState<RangeValue>('all')

  const handleAxisChange = (mode: AxisMode) => {
    setAxisMode(mode)
    setRangeValue('all')
  }

  const isDateMode = axisMode === 'date'

  const chartData = useMemo(() => {
    if (!data.raw || data.raw.length === 0) return []
    const raw = data.raw
    const key = (cat: string) => baseline === 'personal' ? `${cat}_personal` : cat

    if (!isDateMode) {
      // Round mode: simple slice then compute cumulative
      const sliced = rangeValue === 'all'
        ? raw
        : raw.slice(-(parseInt(rangeValue) || raw.length))

      const cumSums: Record<string, number> = {}
      const cumCounts: Record<string, number> = {}
      for (const cat of SG_CATEGORIES) { cumSums[cat] = 0; cumCounts[cat] = 0 }

      return sliced.map((r, i) => {
        const point: Record<string, unknown> = {
          x: `R${i + 1}`,
          roundId: r.round_id,
        }
        for (const cat of SG_CATEGORIES) {
          const val = r[key(cat) as keyof typeof r] as number | null | undefined
          point[`${cat}_pr`] = val ?? null
          if (val != null) { cumSums[cat] += val; cumCounts[cat] += 1 }
          point[cat] = cumCounts[cat] > 0
            ? Math.round((cumSums[cat] / cumCounts[cat]) * 100) / 100
            : null
          if (r.round_id === data.best_rounds?.[cat]?.round_id) point[`${cat}_best`] = val
          if (r.round_id === data.worst_rounds?.[cat]?.round_id) point[`${cat}_worst`] = val
        }
        return point
      })
    }

    // ── Date mode: use numeric epoch for proper time scale ──
    const cumSums: Record<string, number> = {}
    const cumCounts: Record<string, number> = {}
    for (const cat of SG_CATEGORIES) { cumSums[cat] = 0; cumCounts[cat] = 0 }

    const allPoints = raw.map((r) => {
      const point: Record<string, unknown> = {
        x: dateToEpoch(r.date),
        roundId: r.round_id,
      }
      for (const cat of SG_CATEGORIES) {
        const val = r[key(cat) as keyof typeof r] as number | null | undefined
        point[`${cat}_pr`] = val ?? null
        if (val != null) { cumSums[cat] += val; cumCounts[cat] += 1 }
        point[cat] = cumCounts[cat] > 0
          ? Math.round((cumSums[cat] / cumCounts[cat]) * 100) / 100
          : null
        if (r.round_id === data.best_rounds?.[cat]?.round_id) point[`${cat}_best`] = val
        if (r.round_id === data.worst_rounds?.[cat]?.round_id) point[`${cat}_worst`] = val
      }
      return point
    })

    // Append synthetic "today" point extending cumulative avg
    const today = new Date().toISOString().slice(0, 10)
    const lastDate = raw[raw.length - 1]?.date
    if (lastDate && today > lastDate) {
      const todayPoint: Record<string, unknown> = {
        x: dateToEpoch(today),
        roundId: null,
      }
      for (const cat of SG_CATEGORIES) {
        todayPoint[cat] = cumCounts[cat] > 0
          ? Math.round((cumSums[cat] / cumCounts[cat]) * 100) / 100
          : null
        todayPoint[`${cat}_pr`] = null
      }
      allPoints.push(todayPoint)
    }

    // Apply date range filter
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

      if (visible.length === 0) {
        // No rounds in range — flat cumulative avg across window
        const anchor = allPoints[allPoints.length - 1]
        if (!anchor) return []
        const startPoint: Record<string, unknown> = { x: cutoffEpoch, roundId: null }
        const endPoint: Record<string, unknown> = { x: dateToEpoch(today), roundId: null }
        for (const cat of SG_CATEGORIES) {
          startPoint[cat] = anchor[cat]
          startPoint[`${cat}_pr`] = null
          endPoint[cat] = anchor[cat]
          endPoint[`${cat}_pr`] = null
        }
        return [startPoint, endPoint]
      }

      // Include anchor before cutoff so lines enter smoothly
      const anchor = allPoints.filter((p) => (p.x as number) < cutoffEpoch).pop()
      return anchor ? [anchor, ...visible] : visible
    }

    return allPoints
  }, [data.raw, baseline, isDateMode, rangeValue, data.best_rounds, data.worst_rounds])

  if (!data.raw || data.raw.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="SG Trends Over Time"
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              value={axisMode}
              onChange={(e) => handleAxisChange(e.target.value as AxisMode)}
              style={{ width: 'auto' }}
            >
              <option value="rounds">By Round</option>
              <option value="date">By Date</option>
            </Select>
            <Select
              value={rangeValue}
              onChange={(e) => setRangeValue(e.target.value as RangeValue)}
              style={{ width: 'auto' }}
            >
              {!isDateMode ? (
                <>
                  <option value="5">Last 5 Rounds</option>
                  <option value="10">Last 10 Rounds</option>
                  <option value="20">Last 20 Rounds</option>
                  <option value="all">All Rounds</option>
                </>
              ) : (
                <>
                  <option value="1m">1 Month</option>
                  <option value="3m">3 Months</option>
                  <option value="6m">6 Months</option>
                  <option value="1y">1 Year</option>
                  <option value="all">All Time</option>
                </>
              )}
            </Select>
          </div>
        }
      />

      {/* Custom legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '0 20px 8px', fontSize: '0.78rem' }}>
        {SG_CATEGORIES.map((cat) => (
          <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 2.5, background: SG_COLORS[cat], display: 'inline-block' }} />
            {SG_LABELS[cat]}
          </span>
        ))}
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 16, height: 2, background: '#94a3b8', display: 'inline-block' }} /> Cumulative avg
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 16, height: 0, borderTop: '2px dashed #94a3b8', display: 'inline-block' }} /> Per round
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Best
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: CHART_COLORS.text }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Worst
        </span>
      </div>

      <ResponsiveContainer width="100%" height={isMobile ? 240 : 350}>
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
            tickFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
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
              const formatted = value != null ? (value > 0 ? `+${value.toFixed(2)}` : value.toFixed(2)) : '--'
              return [formatted, name]
            }}
          />
          <Legend content={() => null} />

          {/* Cumulative avg lines (solid) */}
          {SG_CATEGORIES.map((cat) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              name={SG_LABELS[cat]}
              stroke={SG_COLORS[cat]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SG_COLORS[cat] }}
              connectNulls
            />
          ))}

          {/* Per-round lines (dashed) */}
          {SG_CATEGORIES.map((cat) => (
            <Line
              key={`${cat}_pr`}
              type="monotone"
              dataKey={`${cat}_pr`}
              name={`${SG_LABELS[cat]} (per round)`}
              stroke={SG_COLORS[cat] + '66'}
              strokeWidth={1}
              strokeDasharray="4 3"
              dot={{ r: 2, fill: SG_COLORS[cat] + '99' }}
              connectNulls
            />
          ))}

          {/* Best markers (green dots) */}
          {SG_CATEGORIES.map((cat) => (
            <Line
              key={`${cat}_best`}
              type="monotone"
              dataKey={`${cat}_best`}
              name={`${SG_LABELS[cat]} best`}
              stroke="transparent"
              dot={{ r: 6, fill: '#22c55e', stroke: '#22c55e', strokeWidth: 2 }}
              legendType="none"
              connectNulls={false}
            />
          ))}

          {/* Worst markers (red dots) */}
          {SG_CATEGORIES.map((cat) => (
            <Line
              key={`${cat}_worst`}
              type="monotone"
              dataKey={`${cat}_worst`}
              name={`${SG_LABELS[cat]} worst`}
              stroke="transparent"
              dot={{ r: 6, fill: '#ef4444', stroke: '#ef4444', strokeWidth: 2 }}
              legendType="none"
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
