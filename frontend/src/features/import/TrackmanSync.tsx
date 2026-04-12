import { useState, useCallback, useEffect } from 'react'
import { Check } from 'lucide-react'
import { Button, Input, useToast } from '../../components'
import { get, post, del } from '../../api/client'
import { useTrackmanSyncSessions, useTrackmanSyncImport } from '../../api'
import type { TrackmanSyncSession } from '../../api'
import styles from './import.module.css'

const TYPE_COLORS: Record<string, string> = {
  Practice: 'var(--accent)',
  'Shot Analysis': '#4caf50',
  'Find My Distance': '#ff9800',
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return 'today'
    if (days === 1) return '1 day ago'
    return `${days} days ago`
  } catch {
    return ''
  }
}

export function TrackmanSync() {
  const [token, setToken] = useState('')
  const [activeToken, setActiveToken] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set())
  const [importingId, setImportingId] = useState<string | null>(null)
  const [loadingToken, setLoadingToken] = useState(true)
  const { toast } = useToast()

  const { data, isLoading, error } = useTrackmanSyncSessions(activeToken, page)
  const importMutation = useTrackmanSyncImport()

  // Load saved token on mount
  useEffect(() => {
    get<{ token: string | null; saved_at: string | null }>('/settings/trackman-token')
      .then((res) => {
        if (res.token) {
          setToken(res.token)
          setActiveToken(res.token)
          setSavedAt(res.saved_at)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingToken(false))
  }, [])

  const handleFetch = useCallback(async () => {
    const trimmed = token.trim()
    if (!trimmed) return
    setActiveToken(trimmed)
    setPage(1)
    setImportedIds(new Set())

    // Save the token
    try {
      const res = await post<{ status: string; saved_at: string }>('/settings/trackman-token', {
        token: trimmed,
      })
      setSavedAt(res.saved_at)
    } catch {
      // Non-critical — token still works for this session
    }
  }, [token])

  const handleClearToken = useCallback(async () => {
    try {
      await del('/settings/trackman-token')
    } catch {}
    setToken('')
    setActiveToken('')
    setSavedAt(null)
    setImportedIds(new Set())
  }, [])

  const handleImport = useCallback(
    async (session: TrackmanSyncSession) => {
      setImportingId(session.id)
      try {
        const result = await importMutation.mutateAsync({
          token: activeToken,
          activity_id: session.id,
          range_id: session.range_id ?? undefined,
          kind: session.kind,
          activity_time: session.time,
        })
        if (result.status === 'duplicate') {
          toast(result.message || 'Already imported', 'error')
        } else {
          toast(
            `Imported ${result.shot_count} shots${result.clubs?.length ? ` (${result.clubs.join(', ')})` : ''}`,
          )
        }
        setImportedIds((prev) => new Set(prev).add(session.id))
      } catch (e) {
        toast('Import failed: ' + (e as Error).message, 'error')
      } finally {
        setImportingId(null)
      }
    },
    [activeToken, importMutation, toast],
  )

  const errorMsg = error
    ? (error as Error).message.includes('401') || (error as Error).message.includes('expired')
      ? 'Token expired or invalid. Please get a fresh token from mytrackman.com.'
      : (error as Error).message
    : null

  if (loadingToken) return null

  return (
    <div>
      <h2 className={styles.sectionTitle}>Trackman Account Sync</h2>
      <p className={styles.sectionDesc}>
        Paste your Bearer token from mytrackman.com to browse and import your sessions.
        {savedAt && (
          <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
            Token saved {timeAgo(savedAt)} — expires after 7 days.
          </span>
        )}
      </p>

      <div className={styles.urlRow}>
        <Input
          className={styles.urlInput}
          placeholder="Paste access token from mytrackman.com"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          type="password"
        />
        <Button onClick={handleFetch} disabled={!token.trim() || isLoading}>
          {isLoading ? 'Fetching\u2026' : 'Fetch Sessions'}
        </Button>
        {activeToken && (
          <Button
            onClick={handleClearToken}
            style={{
              fontSize: '0.78rem',
              padding: '6px 10px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 6 }}>
        Log into mytrackman.com &rarr; DevTools (F12) &rarr; Network tab &rarr; find{' '}
        <code style={{ fontSize: '0.75rem' }}>portal.trackmangolf.com/api/account/me</code> &rarr;
        copy the <code style={{ fontSize: '0.75rem' }}>accessToken</code> value from the response.
      </p>

      {errorMsg && (
        <div
          style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 'var(--radius)',
            background: 'rgba(244,67,54,0.1)',
            border: '1px solid rgba(244,67,54,0.3)',
            color: '#ef5350',
            fontSize: '0.88rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {data && data.sessions.length === 0 && (
        <p style={{ marginTop: 20, color: 'var(--text-muted)', fontSize: '0.88rem' }}>
          No importable sessions found.
        </p>
      )}

      {data && data.sessions.length > 0 && (
        <>
          <table
            style={{
              width: '100%',
              marginTop: 20,
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                  textAlign: 'left',
                  color: 'var(--text-muted)',
                  fontSize: '0.78rem',
                }}
              >
                <th style={{ padding: '8px 10px' }}>Date</th>
                <th style={{ padding: '8px 10px' }}>Type</th>
                <th style={{ padding: '8px 10px' }}>Facility</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Shots</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: 100 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => {
                const imported = s.already_imported || importedIds.has(s.id)
                const isImporting = importingId === s.id
                return (
                  <tr
                    key={s.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                      {formatDate(s.time)}
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          background: `${TYPE_COLORS[s.display_type] || 'var(--accent)'}22`,
                          color: TYPE_COLORS[s.display_type] || 'var(--accent)',
                        }}
                      >
                        {s.display_type}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '10px 10px',
                        color: s.facility ? 'var(--text)' : 'var(--text-dim)',
                      }}
                    >
                      {s.facility || '\u2014'}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                      {s.shot_count ?? '\u2014'}
                    </td>
                    <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                      {imported ? (
                        <Check size={18} color="#4caf50" />
                      ) : (
                        <Button
                          onClick={() => handleImport(s)}
                          disabled={isImporting}
                          style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                        >
                          {isImporting ? 'Importing\u2026' : 'Import'}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {data.page_count > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                marginTop: 16,
                fontSize: '0.85rem',
              }}
            >
              <Button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
              >
                Prev
              </Button>
              <span style={{ color: 'var(--text-muted)' }}>
                Page {data.page} of {data.page_count}
              </span>
              <Button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.page_count}
                style={{ fontSize: '0.78rem', padding: '4px 10px' }}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
