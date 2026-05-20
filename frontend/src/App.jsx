import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Settings from './pages/Settings.jsx'
import Test from './pages/Test.jsx'
import Heatmap from './pages/Heatmap.jsx'
import Layer1 from './pages/Layer1.jsx'

const HOME = import.meta.env.VITE_HOME || '/'

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={HOME === '/' ? <Dashboard /> : <Navigate to={HOME} replace />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/test" element={<Test />} />
          <Route path="/heatmap" element={<Heatmap />} />
          <Route path="/layer1" element={<Layer1 />} />
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
