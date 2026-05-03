import { useState } from 'react'
import { Select } from './Select'
import { PickerTrigger, PickerSheet } from './PickerSheet'
import type { PickerOption } from './PickerSheet'
import { useIsMobile } from '../../hooks/useMediaQuery'

interface ResponsiveSelectProps {
  value: string
  onChange: (value: string) => void
  options: PickerOption[]
  /** Title shown at the top of the mobile picker sheet. */
  title: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Single-pick dropdown that branches by viewport:
 * - **Desktop:** native `<select>` — fast keyboard nav, OS-familiar.
 * - **Mobile:** `PickerSheet` modal — guaranteed dark theming on devices
 *   where Android Chrome ignores `color-scheme: dark` for native bottom sheets
 *   (the typical case for non-PWA-installed dev tabs).
 *
 * Use this anywhere a dropdown is visible on both viewports. For desktop-only
 * screens keep using `Select` directly; for mobile-only screens prefer
 * `PickerSheet` directly.
 */
export function ResponsiveSelect({
  value, onChange, options, title, placeholder, disabled, className,
}: ResponsiveSelectProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  if (!isMobile) {
    return (
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>
    )
  }

  const selected = options.find(o => o.value === value)
  return (
    <>
      <PickerTrigger
        value={value || null}
        displayLabel={selected?.label ?? placeholder ?? ''}
        placeholder={placeholder ?? 'Select…'}
        onClick={() => !disabled && setOpen(true)}
      />
      <PickerSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title}
        options={options}
        selectedValue={value}
        onSelect={(v) => { onChange(v); setOpen(false) }}
      />
    </>
  )
}
