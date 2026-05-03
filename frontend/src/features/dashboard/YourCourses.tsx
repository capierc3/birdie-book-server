import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, ResponsiveSelect } from '../../components'
import type { Course, RoundSummary } from '../../api'

interface Props {
  courses: Course[]
  rounds: RoundSummary[]
}

type SortMode = 'most_played' | 'recent'

export function YourCourses({ courses, rounds }: Props) {
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortMode>('most_played')

  const courseData = useMemo(() => {
    const countMap = new Map<number, number>()
    const lastDateMap = new Map<number, string>()

    for (const r of rounds) {
      if (!r.course_id) continue
      countMap.set(r.course_id, (countMap.get(r.course_id) ?? 0) + 1)
      const prev = lastDateMap.get(r.course_id)
      if (!prev || r.date > prev) lastDateMap.set(r.course_id, r.date)
    }

    return courses
      .map((c) => ({
        ...c,
        roundCount: countMap.get(c.id) ?? 0,
        lastPlayed: lastDateMap.get(c.id) ?? '',
      }))
      .filter((c) => c.roundCount > 0)
      .sort((a, b) =>
        sort === 'most_played'
          ? b.roundCount - a.roundCount
          : b.lastPlayed.localeCompare(a.lastPlayed)
      )
      .slice(0, 5)
  }, [courses, rounds, sort])

  if (courseData.length === 0) return null

  return (
    <Card>
      <CardHeader
        title="Your Courses"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ResponsiveSelect
              value={sort}
              onChange={(v) => setSort(v as SortMode)}
              options={[
                { value: 'most_played', label: 'Most Played' },
                { value: 'recent', label: 'Recent' },
              ]}
              title="Sort"
            />
            <span
              onClick={() => navigate('/courses')}
              style={{ fontSize: '0.78rem', color: 'var(--primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              View All
            </span>
          </div>
        }
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {courseData.map((c) => (
          <div
            key={c.id}
            onClick={() => navigate(`/courses/${c.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              transition: 'background var(--transition)',
              background: 'var(--bg)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg)')}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {c.holes ?? 18}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.display_name}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {c.par ? `Par ${c.par}` : ''}
                {c.par && c.roundCount ? ' · ' : ''}
                {c.roundCount ? `${c.roundCount} round${c.roundCount !== 1 ? 's' : ''}` : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
