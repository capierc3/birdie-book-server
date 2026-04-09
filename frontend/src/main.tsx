import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createIdbPersister, PERSIST_MAX_AGE } from './lib/queryPersist'
import { ToastProvider } from './components'
import App from './App'
import './styles/tokens.css'
import './styles/reset.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: PERSIST_MAX_AGE,  // keep in memory as long as persisted
      retry: 1,
    },
  },
})

const persister = createIdbPersister()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: PERSIST_MAX_AGE }}
    >
      <BrowserRouter basename="/app">
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
)
