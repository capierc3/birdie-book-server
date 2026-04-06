import { Routes, Route } from 'react-router-dom'

function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#1a1a2e',
      background: '#f0f2f5',
    }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
        Birdie Book
      </h1>
      <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem' }}>
        React app is working
      </p>
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '1.5rem 2rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <p style={{ margin: 0, color: '#888' }}>
          Feature 18a scaffold complete. Migration screens will be built here.
        </p>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<Home />} />
    </Routes>
  )
}

export default App
