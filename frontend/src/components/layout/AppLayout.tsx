import { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { MobileHeader } from './MobileHeader'
import { BottomNav } from './BottomNav'
import { MoreMenu } from './MoreMenu'
import { OfflineIndicator } from '../ui/OfflineIndicator'
import { cn } from '../../utils/cn'
import styles from './AppLayout.module.css'

// TEMP: Stage 20a sandbox launcher. Defaults to Swartz Creek Gc (course id 16)
// hole 1. Remove when MapLibre migration ships in Stage 20h.
const MAPLIBRE_TEST_URL = '/maplibre-test/16/1'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MobileHeader />
      <div
        className={cn(styles.overlay, sidebarOpen && styles.open)}
        onClick={() => setSidebarOpen(false)}
      />
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
      <MoreMenu isOpen={moreOpen} onClose={() => setMoreOpen(false)} />
      <BottomNav
        onMorePress={() => setMoreOpen((prev) => !prev)}
        moreOpen={moreOpen}
      />
      <OfflineIndicator />
      <Link
        to={MAPLIBRE_TEST_URL}
        title="Open MapLibre sandbox (Stage 20a — Swartz Creek hole 1)"
        style={{
          position: 'fixed',
          top: 8,
          right: 8,
          zIndex: 5000,
          padding: '4px 10px',
          background: 'rgba(255, 152, 0, 0.92)',
          color: '#1a1a1a',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          borderRadius: 6,
          textDecoration: 'none',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
        }}
      >
        MapLibre β
      </Link>
    </>
  )
}
