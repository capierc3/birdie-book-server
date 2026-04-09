import { openDB } from 'idb'
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

const DB_NAME = 'birdie-book-cache'
const STORE_NAME = 'query-cache'
const CACHE_KEY = 'tanstack-query'

function getDb() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
      if (!db.objectStoreNames.contains('offline-mutations')) {
        db.createObjectStore('offline-mutations', { autoIncrement: true })
      }
    },
  })
}

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      const db = await getDb()
      await db.put(STORE_NAME, client, CACHE_KEY)
    },
    restoreClient: async () => {
      const db = await getDb()
      return await db.get(STORE_NAME, CACHE_KEY)
    },
    removeClient: async () => {
      const db = await getDb()
      await db.delete(STORE_NAME, CACHE_KEY)
    },
  }
}

// Max age for persisted cache: 24 hours
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000

// Export getDb for use by offline queue
export { getDb }
