import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CatalogViewer from './views/CatalogViewer.tsx'

// Internal-only verification page, not part of the player-facing app.
const isInternalCatalogView = window.location.pathname === '/internal/catalog'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isInternalCatalogView ? <CatalogViewer /> : <App />}
  </StrictMode>,
)
