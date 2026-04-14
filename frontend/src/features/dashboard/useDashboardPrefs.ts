import { useState, useCallback } from 'react'
import { WIDGET_REGISTRY } from './widgetRegistry'

const STORAGE_KEY = 'dashboard-widget-prefs'

export interface DashboardPrefs {
  visibleWidgets: string[]
  widgetOrder: string[]
}

const registryIds = WIDGET_REGISTRY.map((w) => w.id)

function loadDefaults(): DashboardPrefs {
  return {
    visibleWidgets: WIDGET_REGISTRY
      .filter((w) => w.defaultVisible)
      .map((w) => w.id),
    widgetOrder: registryIds,
  }
}

/** Ensure every registry widget appears in the order array (handles newly added widgets). */
function normalizeOrder(order: string[]): string[] {
  const known = new Set(registryIds)
  // Keep only IDs that still exist in registry, in user's order
  const result = order.filter((id) => known.has(id))
  // Append any new registry widgets not yet in the user's order
  for (const id of registryIds) {
    if (!result.includes(id)) result.push(id)
  }
  return result
}

function loadPrefs(): DashboardPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DashboardPrefs>
      return {
        visibleWidgets: parsed.visibleWidgets ?? loadDefaults().visibleWidgets,
        widgetOrder: normalizeOrder(parsed.widgetOrder ?? registryIds),
      }
    }
  } catch { /* ignore corrupt data */ }
  return loadDefaults()
}

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState<DashboardPrefs>(loadPrefs)

  const persist = useCallback((next: DashboardPrefs) => {
    setPrefs(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, [])

  const toggleWidget = useCallback((id: string) => {
    setPrefs((prev) => {
      const next: DashboardPrefs = {
        ...prev,
        visibleWidgets: prev.visibleWidgets.includes(id)
          ? prev.visibleWidgets.filter((w) => w !== id)
          : [...prev.visibleWidgets, id],
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const reorderWidgets = useCallback((orderedIds: string[]) => {
    setPrefs((prev) => {
      const next: DashboardPrefs = { ...prev, widgetOrder: orderedIds }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    persist(loadDefaults())
  }, [persist])

  return { prefs, toggleWidget, reorderWidgets, resetToDefaults }
}
