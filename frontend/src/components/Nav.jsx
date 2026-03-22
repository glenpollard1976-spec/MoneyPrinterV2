import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home', exact: true },
  { to: '/securechat', label: 'SecureChat' },
  { to: '/provet', label: 'ProVet' },
  { to: '/gemini-architect', label: 'Gemini Architect' },
  { to: '/ironlog', label: 'IronLog' },
  { to: '/roi', label: 'ROI Calculator' },
  { to: '/ai-academy', label: 'AI Academy' },
]

export default function Nav() {
  return (
    <nav>
      <div className="nav-brand">
        <span>⚙️</span>
        <span>CrownworksNL</span>
      </div>
      <ul className="nav-links">
        {links.map(({ to, label, exact }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={exact}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
