'use client'

import { useCallback, useEffect, useState } from 'react'
import { readParam, writeParams, onPopState } from '@/lib/urlState'
import { LOGO_B64 } from './Dashboard'
import AnalyticsDashboard from './AnalyticsDashboard'
import RegFunnelDashboard from './regfunnel/RegFunnelDashboard'

const API = '/api'
const THEME_KEY = 'em-internal-theme'
const APPS_VALID = ['regfunnel', 'analytics', 'packages']

const canSeeRegFunnel = (user) => Boolean(user?.superAdmin) || user?.department === 'marketing'
const canSeeAnalytics = (user) => Boolean(user?.superAdmin) || user?.department === 'marketing'

const readApp = () => {
  const value = readParam('app', APPS_VALID)
  return value === 'packages' ? 'regfunnel' : value
}

const writeApp = (next, replace) =>
  writeParams(
    {
      app: next,
      ...(next === 'analytics' ? {} : { tab: null }),
    },
    replace,
  )

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function AppShellV2() {
  const [user, setUser] = useState(undefined)
  const [app, setApp] = useState(readApp)
  const [theme, setTheme] = useState(getInitialTheme)

  const go = useCallback((next, options) => {
    setApp(next)
    writeApp(next, Boolean(options?.replace))
  }, [])

  const fetchMe = useCallback(async () => {
    try {
      const response = await fetch(`${API}/users/me`, { credentials: 'include' })
      const data = await response.json()
      setUser(data?.user || null)
    } catch {
      setUser(null)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/users/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // Always clear local app state even if the request fails.
    }
    setUser(null)
    go(null, { replace: true })
  }, [go])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => onPopState(() => setApp(readApp())), [])

  useEffect(() => {
    if (!user) return

    const regFunnelAllowed = canSeeRegFunnel(user)
    const analyticsAllowed = canSeeAnalytics(user)
    const allowed = app === 'regfunnel' ? regFunnelAllowed : app === 'analytics' ? analyticsAllowed : true

    if (app && !allowed) {
      go(null, { replace: true })
      return
    }

    if (!app && regFunnelAllowed && !analyticsAllowed) go('regfunnel', { replace: true })
    else if (!app && analyticsAllowed && !regFunnelAllowed) go('analytics', { replace: true })
  }, [user, app, go])

  if (user === undefined) return <ScreenBg theme={theme}><Loader /></ScreenBg>

  if (!user) {
    return (
      <LoginScreen
        onAuthed={fetchMe}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
    )
  }

  if (app === 'regfunnel') {
    return <RegFunnelDashboard onBack={() => go(null)} />
  }

  if (app === 'analytics') {
    return (
      <AnalyticsDashboard
        user={user}
        onBack={() => go(null)}
        onLogout={logout}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
    )
  }

  return (
    <AppPicker
      user={user}
      onPick={go}
      onLogout={logout}
      theme={theme}
      onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    />
  )
}

function LoginScreen({ onAuthed, theme, onToggleTheme }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (loading) return
    if (!username.trim() || !password) {
      setError('Please enter your username and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`${API}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      })

      if (!response.ok) {
        setError('Incorrect username or password. Please try again.')
        setLoading(false)
        return
      }

      await onAuthed()
    } catch {
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ScreenBg theme={theme}>
      <div className="loginWrap">
        <div className="loginTopActions"><ThemeToggle theme={theme} onToggle={onToggleTheme} /></div>
        <form className="loginGlass" onSubmit={submit}>
          <div className="loginBrand">
            <img src={`data:image/svg+xml;base64,${LOGO_B64}`} alt="easyMarkets" className="brandLogoLogin" />
          </div>
          <div className="loginTitle">Welcome back</div>
          <div className="loginSubtitle">Sign in to access easyMarkets internal tools.</div>

          <div className="formGroup">
            <label className="label" htmlFor="username">Username</label>
            <div className="inputShell">
              <div className="fieldIcon">◎</div>
              <input id="username" className="field" value={username} autoFocus autoComplete="username" placeholder="e.g. natalia.a" onChange={(e) => { setUsername(e.target.value); setError('') }} />
            </div>
          </div>

          <div className="formGroup">
            <label className="label" htmlFor="password">Password</label>
            <div className="passwordWrap inputShell">
              <div className="fieldIcon">⌑</div>
              <input id="password" className="field" value={password} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" onChange={(e) => { setPassword(e.target.value); setError('') }} />
              <button type="button" className="showBtn" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? '◉' : '○'}</button>
            </div>
          </div>

          {error && <div className="errorBox" role="alert"><span>!</span><span>{error}</span></div>}
          <button type="submit" disabled={loading} className="primaryAction"><span>{loading ? 'Signing in...' : 'Sign in'}</span><span>→</span></button>
          <div className="loginSecurity"><span>✓</span><span>Secure easyMarkets internal environment</span></div>
        </form>
      </div>
    </ScreenBg>
  )
}

function AppPicker({ user, onPick, onLogout, theme, onToggleTheme }) {
  const tiles = []

  if (canSeeRegFunnel(user)) {
    tiles.push({
      id: 'regfunnel',
      title: 'RegFunnelOps',
      desc: 'Live registration funnel operations, sends, journey health and A/B performance.',
      accent: 'green',
      tag: 'FUNNEL OPERATIONS',
      visual: <FunnelVisual />,
    })
  }

  if (canSeeAnalytics(user)) {
    tiles.push({
      id: 'analytics',
      title: 'Marketing Analytics',
      desc: 'Global email and push performance across campaigns.',
      accent: 'blue',
      tag: 'PERFORMANCE',
      visual: <AnalyticsVisual />,
    })
  }

  return (
    <ScreenBg theme={theme}>
      <div className="pickerFrame">
        <div className="pickerPanel">
          <div className="panelGlow panelGlowLeft" />
          <div className="panelGlow panelGlowRight" />
          <div className="waveDots waveDotsLeft" />
          <div className="waveDots waveDotsRight" />

          <header className="pickerHeader">
            <div className="pickerBrand"><img src={`data:image/svg+xml;base64,${LOGO_B64}`} alt="easyMarkets" className="brandLogoLight" /></div>
            <div className="pickerActions">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <div className="pickerUser">
                <div className="pickerAvatar">{(user.name || user.username || 'U').charAt(0).toUpperCase()}</div>
                <div className="pickerUserCopy"><span className="userName">{user.name || user.username}</span><span className="userStatus">Signed in</span></div>
                <button type="button" className="pickerLogout" onClick={onLogout} aria-label="Sign out" title="Sign out">↪</button>
              </div>
            </div>
          </header>

          <main className="pickerMain">
            <div className="pickerHeading">
              <div className="pickerEyebrow"><span className="pickerEyebrowDot" />YOUR WORKSPACE</div>
              <h1 className="mainTitle">Choose an <span>app</span></h1>
              <p className="mainSubtitle">Select one of the tools available to your account.</p>
            </div>

            <div className={`cardsGrid ${tiles.length === 1 ? 'singleCard' : ''}`}>
              {tiles.map((tile) => (
                <button type="button" key={tile.id} onClick={() => onPick(tile.id)} className={`appCard ${tile.accent}`} aria-label={`Open ${tile.title}`}>
                  <div className="cardGlow" />
                  <div className="cardTop"><div className="cardTag">{tile.tag}</div><div className={`arrowCircle ${tile.accent}`}>→</div></div>
                  <div className="cardVisualZone">{tile.visual}</div>
                  <div className="cardCopy"><div className="cardTitle">{tile.title}</div><div className="cardDesc">{tile.desc}</div></div>
                  <div className="cardOpen"><span>Open application</span><span>→</span></div>
                  <div className="cardBottomAccent" />
                </button>
              ))}
            </div>

            {!tiles.length && <div className="errorBox">No applications are assigned to this account.</div>}
          </main>

          <footer className="pickerFooter"><span>© {new Date().getFullYear()} easyMarkets</span><span>Internal Tools Platform</span></footer>
        </div>
      </div>
    </ScreenBg>
  )
}

function FunnelVisual() {
  const nodeStyle = { width: 46, height: 46, borderRadius: 14, border: '1px solid rgba(81,237,205,.38)', background: 'rgba(24,190,181,.15)', display: 'grid', placeItems: 'center', color: '#63ead3', fontWeight: 800, fontSize: 12, boxShadow: '0 0 24px rgba(24,190,181,.12)' }
  const lineStyle = { width: 42, height: 2, background: 'linear-gradient(90deg,rgba(99,234,211,.25),rgba(99,234,211,.85))', position: 'relative' }
  return (
    <div style={{ height: '100%', minHeight: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div style={{ position: 'absolute', width: 260, height: 110, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,211,190,.12),transparent 68%)', filter: 'blur(8px)' }} />
      <div style={{ display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div style={nodeStyle}>01</div><div style={lineStyle} /><div style={nodeStyle}>06</div><div style={lineStyle} /><div style={nodeStyle}>15</div>
      </div>
    </div>
  )
}

function AnalyticsVisual() {
  return (
    <div className="visualWrap">
      <div className="visualGlow blue" />
      <div className="analyticsBase" />
      <div className="analyticsBars"><span /><span /><span /><span /></div>
      <div className="analyticsRing" />
      <div className="analyticsLine"><i /><i /><i /></div>
    </div>
  )
}

function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light'
  return <button type="button" className="themeToggle" onClick={onToggle} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} title={light ? 'Dark mode' : 'Light mode'}><span className="themeToggleIcon">{light ? '◐' : '☀'}</span></button>
}

function ScreenBg({ children, theme }) {
  return <div className="screenBg" data-theme={theme}>{children}</div>
}

function Loader() {
  return <div className="loaderShell"><div className="loader" /></div>
}
