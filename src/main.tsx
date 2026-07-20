import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import CatalogViewer from './views/CatalogViewer.tsx'
import FacilitatorSetup from './views/FacilitatorSetup.tsx'
import JoinSession from './views/JoinSession.tsx'
import Lobby from './views/Lobby.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/new" element={<FacilitatorSetup />} />
        <Route path="/join" element={<JoinSession />} />
        <Route path="/session/:code" element={<Lobby />} />
        <Route path="/internal/catalog" element={<CatalogViewer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
