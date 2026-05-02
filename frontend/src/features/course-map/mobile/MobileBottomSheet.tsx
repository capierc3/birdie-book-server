import { useState, useRef, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import s from './MobileBottomSheet.module.css'

export type SheetSnap = 'peek' | 'half' | 'full'
export type MobileTab = 'gps' | 'caddie' | 'shots' | 'notes' | 'edit'

export interface TabConfig {
  key: MobileTab
  label: string
}

const HANDLE_HEIGHT = 32
const DEFAULT_PEEK_HEIGHT = 150

interface Props {
  peekContent: ReactNode
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
  tabs?: TabConfig[]
  children: ReactNode
}

const DEFAULT_TABS: TabConfig[] = [
  { key: 'gps', label: 'GPS' },
  { key: 'caddie', label: 'Caddie' },
  { key: 'shots', label: 'Shots' },
  { key: 'notes', label: 'Notes' },
  { key: 'edit', label: 'Edit' },
]

export function MobileBottomSheet({ peekContent, activeTab, onTabChange, tabs = DEFAULT_TABS, children }: Props) {
  const [snap, setSnap] = useState<SheetSnap>('peek')
  const [peekHeight, setPeekHeight] = useState(DEFAULT_PEEK_HEIGHT)
  const sheetRef = useRef<HTMLDivElement>(null)
  const peekRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ startY: 0, startTranslate: 0, dragging: false })

  const getSnapY = useCallback((s: SheetSnap) => {
    const vh = window.innerHeight
    switch (s) {
      case 'peek': return vh - peekHeight
      case 'half': return vh * 0.55
      case 'full': return vh * 0.15
    }
  }, [peekHeight])

  const [translateY, setTranslateY] = useState(() => window.innerHeight - DEFAULT_PEEK_HEIGHT)

  // Update translateY on snap change or peek-height change (when in peek snap)
  useEffect(() => {
    setTranslateY(getSnapY(snap))
  }, [snap, getSnapY])

  // Auto-measure peek content so the snap point fits whatever's rendered.
  useEffect(() => {
    if (!peekRef.current) return
    const ro = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height ?? 0
      if (h > 0) setPeekHeight(h + HANDLE_HEIGHT + 4)
    })
    ro.observe(peekRef.current)
    return () => ro.disconnect()
  }, [])

  // Expose current sheet height to map overlays (toggles, FABs) via CSS var.
  useEffect(() => {
    const height = window.innerHeight - translateY
    document.documentElement.style.setProperty('--sheet-height', `${height}px`)
  }, [translateY])
  // Expose snap state so map FABs can hide themselves when the sheet is expanded.
  useEffect(() => {
    document.body.dataset.sheetSnap = snap
  }, [snap])
  useEffect(() => () => {
    document.documentElement.style.removeProperty('--sheet-height')
    delete document.body.dataset.sheetSnap
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    dragRef.current = { startY: e.touches[0].clientY, startTranslate: translateY, dragging: true }
  }, [translateY])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current.dragging) return
    const dy = e.touches[0].clientY - dragRef.current.startY
    const newY = Math.max(getSnapY('full'), Math.min(getSnapY('peek'), dragRef.current.startTranslate + dy))
    setTranslateY(newY)
  }, [getSnapY])

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    const vh = window.innerHeight
    const peekY = getSnapY('peek')
    const halfY = getSnapY('half')
    const fullY = getSnapY('full')

    // Snap to nearest
    const dists = [
      { snap: 'peek' as SheetSnap, d: Math.abs(translateY - peekY) },
      { snap: 'half' as SheetSnap, d: Math.abs(translateY - halfY) },
      { snap: 'full' as SheetSnap, d: Math.abs(translateY - fullY) },
    ]
    dists.sort((a, b) => a.d - b.d)
    setSnap(dists[0].snap)
  }, [translateY, getSnapY])

  const handleTabClick = useCallback((tab: MobileTab) => {
    onTabChange(tab)
    if (snap === 'peek') setSnap('half')
  }, [snap, onTabChange])

  const handlePeekTap = useCallback(() => {
    setSnap(prev => prev === 'peek' ? 'half' : 'peek')
  }, [])

  const isExpanded = snap !== 'peek'

  return (
    <div
      ref={sheetRef}
      className={s.sheet}
      style={{ transform: `translateY(${translateY}px)`, height: `${window.innerHeight - translateY}px`, transition: dragRef.current.dragging ? 'none' : 'transform 0.3s ease-out, height 0.3s ease-out' }}
    >
      {/* Drag handle */}
      <div
        className={s.handle}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className={s.handleBar} />
      </div>

      {/* Peek content (always visible) */}
      <div ref={peekRef} className={s.peekContent} onClick={handlePeekTap}>
        {peekContent}
      </div>

      {/* Tab bar (visible when expanded) */}
      {isExpanded && (
        <div className={s.tabBar}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`${s.tab} ${activeTab === tab.key ? s.tabActive : ''}`}
              onClick={() => handleTabClick(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      {isExpanded && (
        <div className={s.content}>
          {children}
        </div>
      )}
    </div>
  )
}
