import { Routes, Route } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Home from './pages/Home.jsx'
import SecureChat from './pages/SecureChat.jsx'
import ProVet from './pages/ProVet.jsx'
import GeminiArchitect from './pages/GeminiArchitect.jsx'
import IronLog from './pages/IronLog.jsx'
import ROICalculator from './pages/ROICalculator.jsx'
import AiAcademy from './pages/AiAcademy.jsx'

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/securechat" element={<SecureChat />} />
        <Route path="/provet" element={<ProVet />} />
        <Route path="/gemini-architect" element={<GeminiArchitect />} />
        <Route path="/ironlog" element={<IronLog />} />
        <Route path="/roi" element={<ROICalculator />} />
        <Route path="/ai-academy" element={<AiAcademy />} />
      </Routes>
      <footer>© {new Date().getFullYear()} CrownworksNL · Powered by Google Gemini</footer>
    </>
  )
}
