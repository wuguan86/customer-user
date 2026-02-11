import React from 'react'
import TitleBar from '../components/TitleBar'

export type AppRoute = 'assistant' | 'settings' | 'me'

type Props = {
  activeRoute: AppRoute
  onNavigate: (route: AppRoute) => void
  children: React.ReactNode
}

function AppShell(props: Props): JSX.Element {
  const { activeRoute, onNavigate, children } = props

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-sidebar">
        <div className="app-brand">
          <div className="app-brand-avatar">视</div>
          <h3 className="app-brand-title">视界AI助手</h3>
        </div>

        <nav className="app-nav">
          <div
            className={`nav-item ${activeRoute === 'assistant' ? 'active' : ''}`}
            onClick={() => onNavigate('assistant')}
          >
            <span className="nav-icon">
              <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </span>
            <span className="nav-label">视界AI运营助手</span>
          </div>
          <div
            className={`nav-item ${activeRoute === 'settings' ? 'active' : ''}`}
            onClick={() => onNavigate('settings')}
          >
            <span className="nav-icon">
              <svg className="nav-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
            </span>
            <span className="nav-label">任务设置</span>
          </div>
        </nav>
        
        <div className="app-nav-footer">
          <div
            className={`nav-item ${activeRoute === 'me' ? 'active' : ''}`}
            onClick={() => onNavigate('me')}
          >
            <div className="nav-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span className="nav-label">我的</span>
          </div>
        </div>
      </div>

      <div className="app-main">
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}

export default AppShell
