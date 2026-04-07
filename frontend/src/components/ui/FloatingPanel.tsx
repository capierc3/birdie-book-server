import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink } from 'lucide-react'
import { Button } from './Button'
import styles from './FloatingPanel.module.css'

interface FloatingPanelProps {
  title: React.ReactNode
  actions?: React.ReactNode
  onClose: () => void
  width?: number
  children: React.ReactNode
}

export function FloatingPanel({
  title,
  actions,
  onClose,
  width = 420,
  children,
}: FloatingPanelProps) {
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - (width + 16),
    y: 80,
  }))
  const [dragging, setDragging] = useState(false)
  const [poppedOut, setPoppedOut] = useState(false)
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const popWinRef = useRef<Window | null>(null)
  const popContainerRef = useRef<HTMLDivElement | null>(null)

  // Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Drag logic
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      // Skip on mobile
      if (window.matchMedia('(max-width: 768px)').matches) return
      // Skip if clicking a button
      if ((e.target as HTMLElement).closest('button')) return

      dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
      setDragging(true)
      e.preventDefault()
    },
    [pos],
  )

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const maxX = window.innerWidth - width
      const maxY = window.innerHeight - 100
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.dx, maxX)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.dy, maxY)),
      })
    }
    const onUp = () => setDragging(false)

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging, width])

  // Pop-out
  const handlePopOut = useCallback(() => {
    const w = window.open('', '_blank', 'width=500,height=700,resizable=yes,scrollbars=yes')
    if (!w) return

    // Copy stylesheets for full fidelity
    const styleEls = document.querySelectorAll('link[rel="stylesheet"], style')
    styleEls.forEach((el) => {
      w.document.head.appendChild(el.cloneNode(true))
    })

    // Base body styles
    const baseStyle = w.document.createElement('style')
    baseStyle.textContent = `
      body { background: var(--bg-card); color: var(--text); font-family: var(--font); margin: 0; padding: 0; }
    `
    w.document.head.appendChild(baseStyle)

    // Create container for React portal
    const container = w.document.createElement('div')
    w.document.body.appendChild(container)

    popWinRef.current = w
    popContainerRef.current = container
    setPoppedOut(true)

    // When pop-out closes
    w.addEventListener('beforeunload', () => {
      popWinRef.current = null
      popContainerRef.current = null
      setPoppedOut(false)
      onClose()
    })
  }, [onClose])

  // Clean up pop-out on unmount
  useEffect(() => {
    return () => {
      if (popWinRef.current && !popWinRef.current.closed) {
        popWinRef.current.close()
      }
    }
  }, [])

  // Render into pop-out window
  if (poppedOut && popContainerRef.current) {
    return createPortal(
      <div style={{ padding: 16 }}>
        <div className={styles.headerTitle} style={{ marginBottom: 12 }}>
          {title}
        </div>
        {children}
      </div>,
      popContainerRef.current,
    )
  }

  return createPortal(
    <div
      className={styles.panel}
      style={{ left: pos.x, top: pos.y, width }}
    >
      <div
        className={`${styles.header}${dragging ? ` ${styles.dragging}` : ''}`}
        onMouseDown={handleDragStart}
      >
        <div className={styles.headerTitle}>{title}</div>
        <div className={styles.headerActions}>
          {actions}
          <Button variant="ghost" size="sm" onClick={handlePopOut} title="Pop out to window">
            <ExternalLink size={14} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} title="Close">
            <X size={14} />
          </Button>
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </div>,
    document.body,
  )
}
