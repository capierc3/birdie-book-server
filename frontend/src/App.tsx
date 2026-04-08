import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components'
import { EmptyState } from './components'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { RoundsPage } from './features/rounds/RoundsPage'
import { RoundDetailPage } from './features/rounds/RoundDetailPage'
import { StrokesGainedPage } from './features/strokes-gained/StrokesGainedPage'
import { ScoringPage } from './features/scoring/ScoringPage'
import { HandicapPage } from './features/handicap/HandicapPage'
import { ClubsPage } from './features/clubs/ClubsPage'
import { ClubDetailPage } from './features/clubs/ClubDetailPage'
import { RangePage } from './features/range/RangePage'
import { RangeDetailPage } from './features/range/RangeDetailPage'
import { CoursesPage } from './features/courses/CoursesPage'
import { ClubDetailPage as GolfClubDetailPage } from './features/courses/ClubDetailPage'
import { CourseStatsPage } from './features/courses/CourseStatsPage'
import { CourseMapPage } from './features/course-map/CourseMapPage'

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
      </div>
      <EmptyState
        message="Coming soon"
        description="This screen will be migrated in a future update."
      />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/rounds" element={<RoundsPage />} />
        <Route path="/rounds/:id" element={<RoundDetailPage />} />
        <Route path="/strokes-gained" element={<StrokesGainedPage />} />
        <Route path="/scoring" element={<ScoringPage />} />
        <Route path="/handicap" element={<HandicapPage />} />
        <Route path="/clubs" element={<ClubsPage />} />
        <Route path="/clubs/:id" element={<ClubDetailPage />} />
        <Route path="/range" element={<RangeDetailPage />} />
        <Route path="/range/sessions" element={<RangePage />} />
        <Route path="/range/:id" element={<RangeDetailPage />} />
        <Route path="/courses" element={<CoursesPage />} />
        <Route path="/courses/club/:id" element={<GolfClubDetailPage />} />
        <Route path="/courses/:id" element={<CourseStatsPage />} />
        <Route path="/courses/:id/map" element={<CourseMapPage />} />
        <Route path="/practice" element={<Placeholder title="Practice" />} />
        <Route path="/import" element={<Placeholder title="Import" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
