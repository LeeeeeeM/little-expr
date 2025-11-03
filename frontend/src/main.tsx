import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './priority-climbing/App.tsx'
import CfgPage from './ast-cfg/CfgPage.tsx'
import StackScopePage from './stack-scope/StackScopePage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/ast-cfg" element={<CfgPage />} />
        <Route path="/stack-scope" element={<StackScopePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
