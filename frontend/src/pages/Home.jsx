import { useNavigate } from 'react-router-dom'

const tools = [
  {
    icon: '🔒',
    name: 'SecureChat',
    desc: 'Upload PDFs and chat with them using AI. Your documents stay private.',
    path: '/securechat',
  },
  {
    icon: '🐾',
    name: 'ProVet Manager',
    desc: 'Track pet health logs with AI triage and veterinary guidance.',
    path: '/provet',
  },
  {
    icon: '✨',
    name: 'Gemini Architect',
    desc: 'Enhance and refine your AI prompts using Gemini.',
    path: '/gemini-architect',
  },
  {
    icon: '🚛',
    name: 'IronLog',
    desc: 'Daily trucking logs with automatic AI summaries and compliance tracking.',
    path: '/ironlog',
  },
  {
    icon: '📊',
    name: 'ROI Calculator',
    desc: 'Calculate your AI automation ROI with a detailed narrative report.',
    path: '/roi',
  },
  {
    icon: '🎓',
    name: 'AI Academy',
    desc: 'Browse learning modules and chat with an AI tutor.',
    path: '/ai-academy',
  },
]

export default function Home() {
  const navigate = useNavigate()
  return (
    <div className="page page-wide">
      <div className="hero">
        <h1>Unleash Your Private AI</h1>
        <p>
          Enterprise-grade AI tools built for Newfoundland's most ambitious leaders.
          Full privacy. Maximum scale.
        </p>
      </div>
      <div className="tools-section">
        <h2>Available Tools</h2>
        <div className="card-grid">
          {tools.map((t) => (
            <div key={t.path} className="tool-card" onClick={() => navigate(t.path)}>
              <div className="icon">{t.icon}</div>
              <h3>{t.name}</h3>
              <p>{t.desc}</p>
              <div className="launch-btn">
                <button className="btn btn-primary btn-sm">Launch →</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
