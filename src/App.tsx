import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Launcher } from './pages/Launcher'
import { PCareApp } from './apps/pcare'
import { GeneralStockApp } from './apps/general-stock'
import { ThemeProvider } from './lib/ThemeContext'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route index element={<Launcher />} />
          <Route path="pcare/*" element={<PCareApp />} />
          <Route path="general-stock/*" element={<GeneralStockApp />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
