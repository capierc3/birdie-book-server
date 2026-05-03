import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import { Card, CardHeader, ResponsiveSelect } from '../../components'
import type { HandicapData } from '../../api'
import { CHART_COLORS } from '../../utils/chartTheme'
import { formatNum } from '../../utils/format'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface Props {
  data: HandicapData
}

type AxisMode = 'rounds' | 'date'
type RangeValue = '5' | '10' | '20' | 'all' | '1m' | '3m' | '6m' | '1y'

function dateToEpoch(iso: string): number {
  return new Date(iso + 'T12:00:00Z').getTime()
}

function formatEpoch(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatEpochFull(epoch: number): string {
  return new Date(epoch).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function HandicapTrendChart({ data }: Props) {
  const isMobile = useIsMobile()
  const [axisMode, setAxisMode] = useState<AxisMode>('rounds')
  const [rangeValue, setRangeValue] = useState<RangeValue>('all')

  const handleAxisChange = (mode: AxisMode) => {
    setAxisMode(mode)
    setRangeValue('all')
  }

  const isDateMode = axisMode === 'date'

  const chartData = useMemo(() => {
    if (data.trend.length === 0) return []
    const trend = data.trend

    if (!isDateMode) {
      const sliced = rangeValue === 'all'
        ? trend
        : trend.slice(-(parseInt(rangeValue) || trend.length))

      return sliced.map((t, i) => ({
        x: `R${i + 1}`,
        index: t.handicap_index,
        differential: t.differential,
        lowIndex: data.low_index,
      }))
    }

    // Date mode: numeric epoch for proper time scale
    const points = trend.map((t) => ({
      x: dateToEpoch(t.date),
      index: t.handicap_index,
      differential: t.differential,
      lowIndex: data.low_index,
    }))

    // Extend to today
    const today = new Date().toISOString().slice(0, 10)
    const lastDate = trend[trend.length - 1]?.date
    if (lastDate && today > lastDate) {
      const lastPoint = points[points.length - 1]
      points.push({
        x: dateToEpoch(today),
        index: lastPoint.index,
        differential: null as unknown as number,
        lowIndex: data.low_index,
      })
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
        default: return points
      }
      const cutoffEpoch = dateToEpoch(cutoff.toISOString().slice(0, 10))

      const visible = points.filter((p) => (p.x as number) >= cutoffEpoch)
      if (visible.length === 0) {
        const last = points[points.length - 1]
        if (!last) return []
        return [
          { ...last, x: cutoffEpoch, differential: null as unknown as number },
          { ...last, x: dateToEpoch(today), differential: null as unknown as number },
        ]
      }
      const anchor = points.filter((p) => (p.x as number) < cutoffEpoch).pop()
      return anchor ? [anchor, ...visible] : visible
    }

    return points
  }, [data.trend, data.low_index, isDateMode, rangeValue])

  if (data.trend.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Handicap Trend"
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
          Handicap Index
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b8f98', display: 'inline-block' }} />
          Differential
        </span>
        {data.low_index != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            Low Index: {formatNum(data.low_index, 1)}
          </span>
        )}
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
            reversed
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => formatNum(v, 1)}
            label={{ value: 'Index', angle: -90, position: 'insideLeft', fill: CHART_COLORS.text, fontSize: 11 }}
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
          />
          <Legend content={() => null} />

          {/* Handicap Index - solid blue */}
          <Line
            type="monotone"
            dataKey="index"
            name="Handicap Index"
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
          />

          {/* Differential - dashed gray */}
          <Line
            type="monotone"
            dataKey="differential"
            name="Differential"
            stroke="#8b8f98"
            strokeWidth={1}
            strokeDasharray="4 3"
            dot={{ r: 2 }}
          />

          {/* Low Index - dashed green reference line */}
          {data.low_index != null && (
            <ReferenceLine
              y={data.low_index}
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="8 4"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
