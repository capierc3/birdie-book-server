import { getDb } from './queryPersist'

const STORE = 'offline-mutations'

export interface QueuedMutation {
  method: string
  path: string
  body?: unknown
  timestamp: number
}

export async function queueMutation(method: string, path: string, body?: unknown) {
  const db = await getDb()
  const mutation: QueuedMutation = {
    method,
    path,
    body,
    timestamp: Date.now(),
  }
  await db.add(STORE, mutation)
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await getDb()
  return await db.getAll(STORE)
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb()
  return await db.count(STORE)
}

export async function replayMutations(): Promise<{ success: number; failed: number }> {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const keys = await store.getAllKeys()
  const mutations = await store.getAll()
  await tx.done

  let success = 0
  let failed = 0

  for (let i = 0; i < mutations.length; i++) {
    const m = mutations[i]
    try {
      const res = await fetch(`/api${m.path}`, {
        method: m.method,
        headers: m.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: m.body !== undefined ? JSON.stringify(m.body) : undefined,
      })
      if (res.ok) {
        const delTx = db.transaction(STORE, 'readwrite')
        await delTx.objectStore(STORE).delete(keys[i])
        await delTx.done
        success++
      } else {
        failed++
      }
    } catch {
      failed++
      break // Stop replaying if network is still down
    }
  }

  return { success, failed }
}

export async function clearQueue() {
  const db = await getDb()
  const tx = db.transaction(STORE, 'readwrite')
  await tx.objectStore(STORE).clear()
  await tx.done
}
