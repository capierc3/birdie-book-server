import { useState, useRef } from 'react'
import { Modal, Button, StatusMessage } from '../../components'
import { useClubPhotos, useSetPhotoFromPlaces, useSetPhotoUpload } from '../../api'
import { cn } from '../../utils/cn'
import cs from './ClubDetailPage.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  clubId: number
}

export function PhotoPickerModal({ isOpen, onClose, clubId }: Props) {
  const [tab, setTab] = useState<'google' | 'upload'>('google')
  const [selectedResource, setSelectedResource] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const photos = useClubPhotos(isOpen ? clubId : undefined)
  const setPhotoPlaces = useSetPhotoFromPlaces()
  const uploadPhoto = useSetPhotoUpload()

  const handleSelectPlaces = async () => {
    if (!selectedResource) return
    setError('')
    try {
      await setPhotoPlaces.mutateAsync({ clubId, photoResource: selectedResource })
      onClose()
    } catch {
      setError('Failed to set photo.')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setError('')
    try {
      await uploadPhoto.mutateAsync({ clubId, file: selectedFile })
      onClose()
    } catch {
      setError('Failed to upload photo.')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Photo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {tab === 'google' && selectedResource && (
            <Button onClick={handleSelectPlaces} disabled={setPhotoPlaces.isPending}>
              {setPhotoPlaces.isPending ? 'Setting...' : 'Use This Photo'}
            </Button>
          )}
          {tab === 'upload' && selectedFile && (
            <Button onClick={handleUpload} disabled={uploadPhoto.isPending}>
              {uploadPhoto.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          )}
        </>
      }
    >
      <div className={cs.photoTabs}>
        <div
          className={cn(cs.photoTab, tab === 'google' && cs.photoTabActive)}
          onClick={() => setTab('google')}
        >
          Google Photos
        </div>
        <div
          className={cn(cs.photoTab, tab === 'upload' && cs.photoTabActive)}
          onClick={() => setTab('upload')}
        >
          Upload
        </div>
      </div>

      {tab === 'google' && (
        <>
          {photos.isLoading && <StatusMessage variant="progress">Loading photos...</StatusMessage>}
          {photos.data && photos.data.photos.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No Google Photos available for this club.</p>
          )}
          {photos.data && photos.data.photos.length > 0 && (
            <div className={cs.photoGrid}>
              {photos.data.photos.map((p) => (
                <img
                  key={p.index}
                  src={`/api/courses/club/${clubId}/photo-thumbnail?resource=${encodeURIComponent(p.resource)}`}
                  alt={`Photo ${p.index + 1}`}
                  className={cn(
                    cs.photoThumb,
                    selectedResource === p.resource && cs.photoThumbSelected,
                  )}
                  onClick={() => setSelectedResource(p.resource)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'upload' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {!previewUrl ? (
            <div className={cs.uploadZone} onClick={() => fileRef.current?.click()}>
              <p style={{ color: 'var(--text-muted)' }}>Click to select a JPG or PNG image</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <img src={previewUrl} alt="Preview" className={cs.uploadPreview} />
              <div style={{ marginTop: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  Choose Different File
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: 8 }}>{error}</div>}
    </Modal>
  )
}
