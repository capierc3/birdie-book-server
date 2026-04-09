import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components'
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
import { PracticePage } from './features/practice/PracticePage'
import { NewPracticePage } from './features/practice/NewPracticePage'
import { PracticeDetailPage } from './features/practice/PracticeDetailPage'
import { ImportPage } from './features/import/ImportPage'
import { SettingsPage } from './features/settings/SettingsPage'

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
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/practice/new" element={<NewPracticePage />} />
        <Route path="/practice/new/round-plan/:roundPlanId" element={<NewPracticePage />} />
        <Route path="/practice/:id" element={<PracticeDetailPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
