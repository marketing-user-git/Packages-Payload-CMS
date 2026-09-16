'use client'

import { useCallback, useEffect, useState } from 'react'
import { readParam, writeParams, onPopState } from '@/lib/urlState'
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

function UiIcon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    eyeOff: <><path d="m3 3 18 18" /><path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.3 6.3C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 3-.5" /></>,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    logout: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4" /></>,
  }

  return <svg {...common}>{paths[name]}</svg>
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
    <ScreenBg theme={theme} className="authScreen">
      <div className="loginWrap">
        <form className="loginGlass" onSubmit={submit}>
          <div className="loginCardTop">
            <div className="loginBrand">
              <img src="/brand/easymarkets-light.svg" alt="easyMarkets" className="brandLogoLogin" />
            </div>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>

          <div className="loginTitle">Welcome back</div>
          <div className="loginSubtitle">Sign in to access easyMarkets internal tools.</div>

          <div className="formGroup">
            <label className="label" htmlFor="username">Username</label>
            <div className="inputShell">
              <span className="fieldIcon"><UiIcon name="user" size={18} /></span>
              <input id="username" className="field" value={username} autoFocus autoComplete="username" placeholder="e.g. natalia.a" onChange={(e) => { setUsername(e.target.value); setError('') }} />
            </div>
          </div>

          <div className="formGroup">
            <label className="label" htmlFor="password">Password</label>
            <div className="passwordWrap inputShell">
              <span className="fieldIcon"><UiIcon name="lock" size={17} /></span>
              <input id="password" className="field" value={password} type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" onChange={(e) => { setPassword(e.target.value); setError('') }} />
              <button type="button" className="showBtn" onClick={() => setShow((value) => !value)} aria-label={show ? 'Hide password' : 'Show password'}>
                <UiIcon name={show ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          {error && <div className="errorBox" role="alert"><span>!</span><span>{error}</span></div>}
          <button type="submit" disabled={loading} className="primaryAction"><span>{loading ? 'Signing in...' : 'Sign in'}</span><span>→</span></button>
          <div className="loginSecurity"><span className="loginSecurityIcon"><UiIcon name="check" size={14} /></span><span>Secure easyMarkets internal environment</span></div>
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

  const logoSrc = theme === 'light' ? '/brand/easymarkets-light.svg' : '/brand/easymarkets-dark.svg'

  return (
    <ScreenBg theme={theme} className="pickerScreen">
      <div className="pickerFrame">
        <div className="pickerPanel">
          <div className="panelGlow panelGlowLeft" />
          <div className="panelGlow panelGlowRight" />
          <div className="waveDots waveDotsLeft" />
          <div className="waveDots waveDotsRight" />

          <header className="pickerHeader">
            <div className="pickerBrand"><img src={logoSrc} alt="easyMarkets" className="brandLogoLight" /></div>
            <div className="pickerActions">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
              <div className="pickerUser">
                <div className="pickerAvatar">{(user.name || user.username || 'U').charAt(0).toUpperCase()}</div>
                <div className="pickerUserCopy"><span className="userName">{user.name || user.username}</span><span className="userStatus">Signed in</span></div>
                <button type="button" className="pickerLogout" onClick={onLogout} aria-label="Sign out" title="Sign out"><UiIcon name="logout" size={17} /></button>
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
  return (
    <div className="funnelVisual">
      <div className="funnelGlow" />
      <div className="funnelNodes">
        <div className="funnelNode">01</div><div className="funnelLine" /><div className="funnelNode">06</div><div className="funnelLine" /><div className="funnelNode">15</div>
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
  return (
    <button type="button" className="themeToggle" onClick={onToggle} aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'} title={light ? 'Dark mode' : 'Light mode'}>
      <span className="themeToggleIcon"><UiIcon name={light ? 'moon' : 'sun'} size={17} /></span>
    </button>
  )
}

function ScreenBg({ children, theme, className = '' }) {
  return <div className={`screenBg ${className}`.trim()} data-theme={theme}>{children}</div>
}

function Loader() {
  return <div className="loaderShell"><div className="loader" /></div>
}
