import { useRef, useState, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../utils/cn'
import styles from './DropZone.module.css'

interface DropZoneProps {
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  disabled?: boolean
  label?: string
  sublabel?: string
  className?: string
}

export function DropZone({
  accept,
  multiple = false,
  onFiles,
  disabled = false,
  label = 'Drop files here or browse',
  sublabel,
  className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragover, setDragover] = useState(false)

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList)
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragover(false)
      if (!disabled) handleFiles(e.dataTransfer.files)
    },
    [disabled, handleFiles],
  )

  return (
    <div
      className={cn(
        styles.zone,
        dragover && styles.dragover,
        disabled && styles.disabled,
        className,
      )}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragover(true)
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={handleDrop}
    >
      <Upload className={styles.icon} />
      <div className={styles.label}>{label}</div>
      {sublabel && <div className={styles.sublabel}>{sublabel}</div>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.hidden}
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
