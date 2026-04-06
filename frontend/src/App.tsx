import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components'
import { EmptyState } from './components'

function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{title}</h1>
      </div>
      <EmptyState
        message="Coming in 18e"
        description="This screen will be migrated from the legacy app."
      />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/rounds" element={<Placeholder title="Rounds" />} />
        <Route path="/clubs" element={<Placeholder title="My Bag" />} />
        <Route path="/strokes-gained" element={<Placeholder title="Strokes Gained" />} />
        <Route path="/handicap" element={<Placeholder title="Handicap" />} />
        <Route path="/scoring" element={<Placeholder title="Stats" />} />
        <Route path="/range" element={<Placeholder title="Range" />} />
        <Route path="/courses" element={<Placeholder title="Courses" />} />
        <Route path="/practice" element={<Placeholder title="Practice" />} />
        <Route path="/import" element={<Placeholder title="Import" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
