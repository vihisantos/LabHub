import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Boot from './Boot'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
)
