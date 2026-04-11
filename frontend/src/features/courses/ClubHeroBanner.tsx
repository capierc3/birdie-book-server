import { ArrowLeft, Camera } from 'lucide-react'
import { Button } from '../../components'
import type { GolfClubSummary } from '../../api'
import cs from './ClubDetailPage.module.css'

interface Props {
  club: GolfClubSummary
  onBack: () => void
  onChangePhoto: () => void
}

export function ClubHeroBanner({ club, onBack, onChangePhoto }: Props) {
  const photoUrl = club.photo_url || `${import.meta.env.BASE_URL}default-course.jpg`
  const bgStyle = { backgroundImage: `url(${photoUrl}${club.photo_url ? `?t=${Date.now()}` : ''})` }

  return (
    <div className={cs.hero} style={bgStyle}>
      <div className={cs.heroOverlay} />
      <div className={cs.heroContent}>
        <div className={cs.heroBack}>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} /> All Clubs
          </Button>
        </div>
        <div className={cs.heroActions}>
          <Button variant="ghost" size="sm" onClick={onChangePhoto} title="Change photo"
            style={{ padding: '6px', opacity: 0.7, color: '#fff' }}
          >
            <Camera size={14} />
          </Button>
        </div>
        <h1 className={cs.heroTitle}>{club.name}</h1>
        {club.address && <div className={cs.heroSubtitle}>{club.address}</div>}
        {!club.address && (
          <div className={cs.heroSubtitle}>
            {club.course_count} course{club.course_count !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
