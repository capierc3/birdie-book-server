import type { ComponentType } from 'react'

export type WidgetCategory = 'course' | 'range' | 'equipment'
export type WidgetSize = 'full' | 'half' | 'stat-row'

export interface WidgetDefinition {
  id: string
  title: string
  description: string
  category: WidgetCategory
  size: WidgetSize
  defaultVisible: boolean
  component: ComponentType
}

// Lazy imports — only loaded when rendered
import { QuickStatsWidget } from './widgets/QuickStatsWidget'
import { Scoring18Widget } from './widgets/Scoring18Widget'
import { Scoring9Widget } from './widgets/Scoring9Widget'
import { SGWidget } from './widgets/SGWidget'
import { KeyStatsWidget } from './widgets/KeyStatsWidget'
import { RecentRoundsWidget } from './widgets/RecentRoundsWidget'
import { YourCoursesWidget } from './widgets/YourCoursesWidget'
import { ClubDistancesWidget } from './widgets/ClubDistancesWidget'
import { RecentRangeSessionsWidget } from './widgets/RecentRangeSessionsWidget'
import { LaunchAveragesWidget } from './widgets/LaunchAveragesWidget'
import { SGByClubWidget } from './widgets/SGByClubWidget'

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // ── stat-row ──
  {
    id: 'quick-stats',
    title: 'Quick Stats',
    description: 'Total rounds, courses played, handicap',
    category: 'course',
    size: 'stat-row',
    defaultVisible: true,
    component: QuickStatsWidget,
  },

  // ── course (half) ──
  {
    id: 'scoring-18',
    title: '18-Hole Scoring',
    description: 'Scoring breakdown for 18-hole rounds',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: Scoring18Widget,
  },
  {
    id: 'scoring-9',
    title: '9-Hole Scoring',
    description: 'Scoring breakdown for 9-hole rounds',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: Scoring9Widget,
  },
  {
    id: 'strokes-gained',
    title: 'Strokes Gained',
    description: 'SG summary by category vs PGA',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: SGWidget,
  },
  {
    id: 'key-stats',
    title: 'Key Stats',
    description: 'GIR, fairway, putts, scramble, 3-putt',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: KeyStatsWidget,
  },
  {
    id: 'recent-rounds',
    title: 'Recent Rounds',
    description: 'Your 5 most recent rounds',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: RecentRoundsWidget,
  },
  {
    id: 'your-courses',
    title: 'Your Courses',
    description: 'Top courses by play count or recency',
    category: 'course',
    size: 'half',
    defaultVisible: true,
    component: YourCoursesWidget,
  },

  // ── range (half) ──
  {
    id: 'club-distances',
    title: 'Club Distances',
    description: 'Box plot showing distance gaps between clubs',
    category: 'range',
    size: 'half',
    defaultVisible: false,
    component: ClubDistancesWidget,
  },
  {
    id: 'recent-range-sessions',
    title: 'Recent Range Sessions',
    description: 'Latest practice sessions',
    category: 'range',
    size: 'half',
    defaultVisible: false,
    component: RecentRangeSessionsWidget,
  },
  {
    id: 'launch-averages',
    title: 'Launch Monitor Averages',
    description: 'Avg carry, ball speed, launch angle, spin by club',
    category: 'range',
    size: 'half',
    defaultVisible: false,
    component: LaunchAveragesWidget,
  },

  // ── equipment (half) ──
  {
    id: 'sg-by-club',
    title: 'Strokes Gained by Club',
    description: 'Which clubs gain or lose the most strokes',
    category: 'equipment',
    size: 'half',
    defaultVisible: false,
    component: SGByClubWidget,
  },
]
