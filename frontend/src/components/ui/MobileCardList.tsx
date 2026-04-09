import type { ReactNode } from 'react'
import styles from './MobileCardList.module.css'

interface MobileCardListProps<T> {
  data: T[]
  keyExtractor: (row: T) => string | number
  renderCard: (row: T) => ReactNode
  onCardClick?: (row: T) => void
  emptyMessage?: string
}

export function MobileCardList<T>({
  data,
  keyExtractor,
  renderCard,
  onCardClick,
  emptyMessage = 'No data',
}: MobileCardListProps<T>) {
  if (data.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>
  }

  return (
    <div className={styles.list}>
      {data.map((row) => (
        <div
          key={keyExtractor(row)}
          className={onCardClick ? styles.clickable : styles.card}
          onClick={onCardClick ? () => onCardClick(row) : undefined}
        >
          {renderCard(row)}
        </div>
      ))}
    </div>
  )
}
