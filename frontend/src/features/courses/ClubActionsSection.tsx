import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardHeader, Button, StatusMessage, useConfirm } from '../../components'
import { useSyncClubCourses, useClubDeletePreview, useDeleteClub } from '../../api'

interface Props {
  clubId: number
}

export function ClubActionsSection({ clubId }: Props) {
  const navigate = useNavigate()
  const sync = useSyncClubCourses()
  const deleteClub = useDeleteClub()
  const { data: preview } = useClubDeletePreview(clubId)
  const { confirm } = useConfirm()
  const [statusMsg, setStatusMsg] = useState<{ variant: 'success' | 'error' | 'progress'; text: string } | null>(null)

  const handleSync = async () => {
    const ok = await confirm({
      title: 'Sync Courses',
      message: 'Sync all courses for this club from the golf database? This may add or update tee and hole data.',
      confirmLabel: 'Sync',
    })
    if (!ok) return
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

  const handleDelete = async () => {
    if (!preview) return
    const clubName = preview.club_name || 'this club'
    const courseWord = preview.course_count === 1 ? 'course' : 'courses'
    const roundWord = preview.round_count === 1 ? 'round' : 'rounds'
    const ok = await confirm({
      title: 'Delete Club',
      message:
        `Delete ${clubName}?\n\n` +
        `This will permanently delete ${preview.course_count} ${courseWord} and ${preview.round_count} ${roundWord}. ` +
        `This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
    if (!ok) return
    setStatusMsg({ variant: 'progress', text: 'Deleting club...' })
    try {
      await deleteClub.mutateAsync(clubId)
      navigate('/courses')
    } catch {
      setStatusMsg({ variant: 'error', text: 'Delete failed. Please try again.' })
    }
  }

  return (
    <Card>
      <CardHeader title="Club Actions" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="secondary" size="sm" onClick={handleSync} disabled={sync.isPending}>
          <RefreshCw size={14} /> Sync All Courses
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDelete}
          disabled={!preview || deleteClub.isPending}
          style={{ color: 'var(--red, #ef5350)' }}
        >
          <Trash2 size={14} />
          {preview
            ? ` Delete Club (${preview.course_count} ${preview.course_count === 1 ? 'course' : 'courses'}, ${preview.round_count} ${preview.round_count === 1 ? 'round' : 'rounds'})`
            : ' Delete Club'}
        </Button>
      </div>
      {statusMsg && (
        <div style={{ marginTop: 12 }}>
          <StatusMessage variant={statusMsg.variant}>{statusMsg.text}</StatusMessage>
        </div>
      )}
    </Card>
  )
}
