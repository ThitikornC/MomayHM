import { NavLink } from 'react-router-dom'

export default function Header({ title, children }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 24px', height: 56, flexShrink: 0,
      borderBottom: '1px solid var(--border)', background: 'var(--surface)',
    }}>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600,
        letterSpacing: '.08em', color: 'var(--accent2)',
      }}>
        {title || 'PERSON COUNTER'}
      </span>
      {children}
    </header>
  )
}
