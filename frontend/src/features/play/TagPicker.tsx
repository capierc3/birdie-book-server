import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import type { Tag, TagCategory } from '../../api'
import { useTags } from '../../api'
import s from './TagPicker.module.css'

export interface TagPickerProps {
  category: TagCategory
  selectedIds: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
  /** Hard cap on the number of selected tags. `null` = no cap. */
  maxSelection?: number | null
}

export function TagPicker({
  category,
  selectedIds,
  onChange,
  disabled,
  maxSelection = null,
}: TagPickerProps) {
  const { data: tags, isLoading } = useTags(category)
  const [expanded, setExpanded] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Collapse the picker when the user clicks outside it.
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [expanded])

  const tagsById = useMemo(() => {
    const m = new Map<number, Tag>()
    for (const t of tags ?? []) m.set(t.id, t)
    return m
  }, [tags])

  const grouped = useMemo(() => {
    if (!tags) return [] as { sub_category: string; tags: Tag[] }[]
    const visible = tags.filter((t) => !t.is_archived)
    const map = new Map<string, Tag[]>()
    for (const t of visible) {
      const key = t.sub_category ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries()).map(([sub_category, ts]) => ({ sub_category, tags: ts }))
  }, [tags])

  const selected = new Set(selectedIds)
  const atCap = maxSelection != null && selected.size >= maxSelection

  const toggle = (id: number) => {
    if (disabled) return
    if (selected.has(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      if (atCap) return
      onChange([...selectedIds, id])
    }
  }

  if (isLoading) return <div className={s.empty}>Loading tags…</div>
  if (!tags || tags.length === 0) return <div className={s.empty}>No tags available.</div>

  return (
    <div className={s.picker} ref={wrapRef}>
      {/* Selected chips + Add toggle */}
      <div className={s.selectedRow}>
        {selectedIds.length === 0 ? (
          <span className={s.selectedEmpty}>No tags selected</span>
        ) : (
          <div className={s.selectedChips}>
            {selectedIds.map((id) => {
              const t = tagsById.get(id)
              const archived = !t // unknown id = archived/deleted server-side
              return (
                <button
                  key={id}
                  type="button"
                  className={`${s.selectedChip} ${archived ? s.chipArchived : ''}`}
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  title={archived ? 'Tag archived — tap to remove' : 'Remove'}
                >
                  <span>{t?.name ?? `#${id}`}</span>
                  <X size={12} className={s.removeIcon} aria-hidden />
                </button>
              )
            })}
          </div>
        )}

        <div className={s.addRow}>
          <button
            type="button"
            className={`${s.addBtn} ${expanded ? s.addBtnOpen : ''}`}
            onClick={() => setExpanded((v) => !v)}
            disabled={disabled}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={14} /> : <Plus size={14} />}
            {expanded ? 'Done' : 'Add tag'}
          </button>
          {maxSelection != null && (
            <span className={s.capLabel}>
              {selected.size} / {maxSelection}
            </span>
          )}
        </div>
      </div>

      {/* Expanded bank — grouped by sub_category */}
      {expanded && (
        <div className={s.bank}>
          {grouped.map((group) => (
            <div key={group.sub_category} className={s.group}>
              {group.sub_category && <div className={s.subHead}>{group.sub_category}</div>}
              <div className={s.row}>
                {group.tags.map((t) => {
                  const on = selected.has(t.id)
                  const blocked = !on && atCap
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`${s.chip} ${on ? s.chipOn : ''} ${blocked ? s.chipBlocked : ''}`}
                      onClick={() => toggle(t.id)}
                      disabled={disabled || blocked}
                      aria-pressed={on}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
