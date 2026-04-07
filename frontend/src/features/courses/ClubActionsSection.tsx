import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardHeader, Button, StatusMessage } from '../../components'
import { useSyncClubCourses } from '../../api'

interface Props {
  clubId: number
}

export function ClubActionsSection({ clubId }: Props) {
  const sync = useSyncClubCourses()
  const [statusMsg, setStatusMsg] = useState<{ variant: 'success' | 'error' | 'progress'; text: string } | null>(null)

  const handleSync = async () => {
    if (!window.confirm('Sync all courses for this club from the golf database? This may add or update tee and hole data.')) {
      return
    }
    setStatusMsg({ variant: 'progress', text: 'Syncing courses...' })
    try {
      const result = await sync.mutateAsync(clubId)
      const count = result.details?.length ?? 0
      setStatusMsg({ variant: 'success', text: `Synced ${count} course${count !== 1 ? 's' : ''}.` })
      setTimeout(() => setStatusMsg(null), 5000)
    } catch {
      setStatusMsg({ variant: 'error', text: 'Sync failed. Please try again.' })
    }
  }

  return (
    <Card>
      <CardHeader title="Club Actions" />
      <Button variant="secondary" size="sm" onClick={handleSync} disabled={sync.isPending}>
        <RefreshCw size={14} /> Sync All Courses
      </Button>
      {statusMsg && (
        <div style={{ marginTop: 12 }}>
          <StatusMessage variant={statusMsg.variant}>{statusMsg.text}</StatusMessage>
        </div>
      )}
    </Card>
  )
}
