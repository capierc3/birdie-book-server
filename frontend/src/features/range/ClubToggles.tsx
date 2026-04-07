import styles from './RangeDetailPage.module.css'

interface Props {
  clubs: string[]
  enabledClubs: Set<string>
  clubColors: Map<string, string>
  onToggle: (club: string) => void
  onToggleAll: () => void
}

export function ClubToggles({ clubs, enabledClubs, clubColors, onToggle, onToggleAll }: Props) {
  const allEnabled = clubs.length > 0 && clubs.every((c) => enabledClubs.has(c))

  return (
    <div className={styles.clubToggles}>
      <button
        className={`${styles.clubToggle} ${allEnabled ? styles.clubToggleActive : ''}`}
        style={allEnabled ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        onClick={onToggleAll}
      >
        All
      </button>
      {clubs.map((club) => {
        const color = clubColors.get(club) ?? '#888'
        const active = enabledClubs.has(club)
        return (
          <button
            key={club}
            className={`${styles.clubToggle} ${active ? styles.clubToggleActive : ''}`}
            style={active ? { borderColor: color, color } : undefined}
            onClick={() => onToggle(club)}
          >
            <span className={styles.clubDot} style={{ background: color }} />
            {club}
          </button>
        )
      })}
    </div>
  )
}
