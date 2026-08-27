'use client'

import { useState, useEffect, useCallback } from 'react'
import { readParam, writeParams, onPopState } from '@/lib/urlState'
import { Dashboard, LOGO_B64 } from './Dashboard'
import AnalyticsDashboard from './AnalyticsDashboard'

const API = '/api'

const APPS_VALID = ['packages', 'analytics']
const THEME_KEY = 'em-internal-theme'

/* ==========================================================================
   SESSION
   ========================================================================== */

function toPackagesSession(u) {
  let role = 'rm'

  if (u.superAdmin) role = 'manager'
  else if (u.department === 'sales' && u.level === 'manager') role = 'manager'
  else if (u.department === 'sales' && u.level === 'member') role = 'rm'
  else if (u.department === 'marketing') role = 'reports'

  return {
    user: {
      name: u.name || u.username,
      role,
      regions: u.regions?.length ? u.regions : null,
    },
    loginTime: Date.now(),
  }
}

const canSeePackages = (u) => Boolean(u?.superAdmin) || u?.department === 'sales'

const canSeeAnalytics = (u) => Boolean(u?.superAdmin) || u?.department === 'marketing'

/* ==========================================================================
   URL STATE
   ========================================================================== */

const readApp = () => readParam('app', APPS_VALID)

const writeApp = (next, replace) =>
  writeParams(
    {
      app: next,
      ...(next === 'analytics' ? {} : { tab: null }),
    },
    replace,
  )

/* ==========================================================================
   THEME
   ========================================================================== */

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'

  const stored = window.localStorage.getItem(THEME_KEY)

  if (stored === 'dark' || stored === 'light') {
    return stored
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/* ==========================================================================
   APP SHELL
   ========================================================================== */

export default function AppShell() {
  const [user, setUser] = useState(undefined)
  const [app, setApp] = useState(readApp)
  const [theme, setTheme] = useState(getInitialTheme)

  const go = useCallback((next, opts) => {
    setApp(next)
    writeApp(next, Boolean(opts?.replace))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  /* ------------------------------------------------------------------------
     Persist theme
     ------------------------------------------------------------------------ */

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  /* ------------------------------------------------------------------------
     Current user
     ------------------------------------------------------------------------ */

  const fetchMe = useCallback(async () => {
    try {
      const response = await fetch(`${API}/users/me`, {
        credentials: 'include',
      })

      const data = await response.json()

      setUser(data?.user || null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  /* ------------------------------------------------------------------------
     Browser back / forward
     ------------------------------------------------------------------------ */

  useEffect(() => {
    return onPopState(() => {
      setApp(readApp())
    })
  }, [])

  /* ------------------------------------------------------------------------
     Permissions / automatic routing
     ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!user) return

    const packagesAllowed = canSeePackages(user)
    const analyticsAllowed = canSeeAnalytics(user)

    const allowed =
      app === 'packages' ? packagesAllowed : app === 'analytics' ? analyticsAllowed : true

    if (app && !allowed) {
      go(null, { replace: true })
      return
    }

    if (!app) {
      if (packagesAllowed && !analyticsAllowed) {
        go('packages', { replace: true })
      } else if (analyticsAllowed && !packagesAllowed) {
        go('analytics', { replace: true })
      }
    }
  }, [user, app, go])

  /* ------------------------------------------------------------------------
     Logout
     ------------------------------------------------------------------------ */

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/users/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {
      // Logout locally even if the request fails.
    }

    setUser(null)
    go(null, { replace: true })
  }, [go])

  /* ------------------------------------------------------------------------
     Loading
     ------------------------------------------------------------------------ */

  if (user === undefined) {
    return (
      <ScreenBg theme={theme}>
        <Loader />
      </ScreenBg>
    )
  }

  /* ------------------------------------------------------------------------
     Login
     ------------------------------------------------------------------------ */

  if (!user) {
    return <LoginScreen onAuthed={fetchMe} theme={theme} onToggleTheme={toggleTheme} />
  }

  /* ------------------------------------------------------------------------
     Packages
     ------------------------------------------------------------------------ */

  if (app === 'packages') {
    return <Dashboard session={toPackagesSession(user)} onLogout={logout} />
  }

  /* ------------------------------------------------------------------------
     Analytics
     ------------------------------------------------------------------------ */

  if (app === 'analytics') {
    return (
      <AnalyticsDashboard
        user={user}
        onBack={user.superAdmin ? () => go(null) : null}
        onLogout={logout}
        /*
         * These are ready for the AnalyticsDashboard redesign.
         * JS ignores them if the component doesn't use them yet.
         */
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  /* ------------------------------------------------------------------------
     Picker
     ------------------------------------------------------------------------ */

  return (
    <AppPicker
      user={user}
      onPick={go}
      onLogout={logout}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )
}

/* ==========================================================================
   LOGIN
   ========================================================================== */

function LoginScreen({ onAuthed, theme, onToggleTheme }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event) => {
    event?.preventDefault()

    if (loading) return

    if (!username.trim() || !password) {
      setErr('Please enter your username and password.')
      return
    }

    setLoading(true)
    setErr('')

    try {
      const response = await fetch(`${API}/users/login`, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        credentials: 'include',

        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
        }),
      })

      if (!response.ok) {
        setErr('Incorrect username or password. Please try again.')
        setLoading(false)
        return
      }

      await onAuthed()
    } catch {
      setErr('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ScreenBg theme={theme}>
      <div className="loginWrap">
        <div className="loginTopActions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <form className="loginGlass" onSubmit={submit}>
          <div className="loginBrand">
            <img
              src={`data:image/svg+xml;base64,${LOGO_B64}`}
              alt="easyMarkets"
              className="brandLogoLogin"
            />
          </div>

          <div className="loginTitle">Welcome back</div>

          <div className="loginSubtitle">Sign in to access easyMarkets internal tools.</div>

          <div className="formGroup">
            <label className="label" htmlFor="username">
              Username
            </label>

            <div className="inputShell">
              <div className="fieldIcon">
                <UserIcon />
              </div>

              <input
                id="username"
                name="username"
                value={username}
                autoFocus
                autoComplete="username"
                onChange={(event) => {
                  setUsername(event.target.value)
                  setErr('')
                }}
                placeholder="e.g. natalia.a"
                className="field"
              />
            </div>
          </div>

          <div className="formGroup">
            <label className="label" htmlFor="password">
              Password
            </label>

            <div className="passwordWrap inputShell">
              <div className="fieldIcon">
                <LockIcon />
              </div>

              <input
                id="password"
                name="password"
                value={password}
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                onChange={(event) => {
                  setPassword(event.target.value)
                  setErr('')
                }}
                placeholder="Enter your password"
                className="field"
              />

              <button
                type="button"
                className="showBtn"
                onClick={() => setShow((current) => !current)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {err && (
            <div className="errorBox" role="alert">
              <AlertIcon />

              <span>{err}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="primaryAction">
            <span>{loading ? 'Signing in...' : 'Sign in'}</span>

            {loading ? <ButtonLoader /> : <ArrowRightIcon />}
          </button>

          <div className="loginSecurity">
            <ShieldIcon />

            <span>Secure easyMarkets internal environment</span>
          </div>
        </form>
      </div>
    </ScreenBg>
  )
}

/* ==========================================================================
   APP PICKER
   ========================================================================== */

function AppPicker({ user, onPick, onLogout, theme, onToggleTheme }) {
  const tiles = []

  if (canSeePackages(user)) {
    tiles.push({
      id: 'packages',
      title: 'Packages Journey',
      desc: 'Client journey tracking for the packages campaign.',
      accent: 'green',
      tag: 'CLIENT JOURNEY',
      visual: <PackageVisual />,
    })
  }

  if (canSeeAnalytics(user)) {
    tiles.push({
      id: 'analytics',
      title: 'Marketing Analytics',
      desc: 'Global email & push performance across all campaigns.',
      accent: 'blue',
      tag: 'PERFORMANCE',
      visual: <AnalyticsVisual />,
    })
  }

  return (
    <ScreenBg theme={theme}>
      <div className="pickerFrame">
        <div className="pickerPanel">
          {/* Ambient background */}

          <div className="panelGlow panelGlowLeft" />
          <div className="panelGlow panelGlowRight" />

          <div className="waveDots waveDotsLeft" />
          <div className="waveDots waveDotsRight" />

          {/* Header */}

          <header className="pickerHeader">
            <div className="pickerBrand">
              <img
                src={`data:image/svg+xml;base64,${LOGO_B64}`}
                alt="easyMarkets"
                className="brandLogoLight"
              />
            </div>

            <div className="pickerActions">
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />

              <div className="pickerUser">
                <div className="pickerAvatar">
                  {(user.name || user.username || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="pickerUserCopy">
                  <span className="userName">{user.name || user.username}</span>

                  <span className="userStatus">Signed in</span>
                </div>

                <button
                  type="button"
                  className="pickerLogout"
                  onClick={onLogout}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogoutIcon />
                </button>
              </div>
            </div>
          </header>

          {/* Content */}

          <main className="pickerMain">
            <div className="pickerHeading">
              <div className="pickerEyebrow">
                <span className="pickerEyebrowDot" />
                YOUR WORKSPACE
              </div>

              <h1 className="mainTitle">
                Choose an <span>app</span>
              </h1>

              <p className="mainSubtitle">Select one of the tools available to your account.</p>
            </div>

            <div className={`cardsGrid ${tiles.length === 1 ? 'singleCard' : ''}`}>
              {tiles.map((tile) => (
                <button
                  type="button"
                  key={tile.id}
                  onClick={() => onPick(tile.id)}
                  className={`appCard ${tile.accent}`}
                  aria-label={`Open ${tile.title}`}
                >
                  <div className="cardGlow" />

                  <div className="cardTop">
                    <div className="cardTag">{tile.tag}</div>

                    <div className={`arrowCircle ${tile.accent}`}>
                      <ArrowRightIcon />
                    </div>
                  </div>

                  <div className="cardVisualZone">{tile.visual}</div>

                  <div className="cardCopy">
                    <div className="cardTitle">{tile.title}</div>

                    <div className="cardDesc">{tile.desc}</div>
                  </div>

                  <div className="cardOpen">
                    <span>Open application</span>

                    <ArrowRightIcon />
                  </div>

                  <div className="cardBottomAccent" />
                </button>
              ))}
            </div>

            {/* Trust strip */}

            <div className="trustRow">
              <TrustItem
                icon={<ShieldIcon />}
                title="Secure & reliable"
                text="Enterprise platform"
              />

              <div className="trustDivider" />

              <TrustItem
                icon={<ChartSmallIcon />}
                title="Real-time insights"
                text="Data that drives results"
              />

              <div className="trustDivider" />

              <TrustItem
                icon={<UsersIcon />}
                title="Built for performance"
                text="Designed for your team"
              />
            </div>
          </main>

          <footer className="pickerFooter">
            <span>© {new Date().getFullYear()} easyMarkets</span>

            <span>Internal Tools Platform</span>
          </footer>
        </div>
      </div>
    </ScreenBg>
  )
}

/* ==========================================================================
   TRUST ITEM
   ========================================================================== */

function TrustItem({ icon, title, text }) {
  return (
    <div className="trustItem">
      <div className="trustIcon">{icon}</div>

      <div className="trustText">
        <strong>{title}</strong>

        <span>{text}</span>
      </div>
    </div>
  )
}

/* ==========================================================================
   PACKAGE VISUAL
   ========================================================================== */

function PackageVisual() {
  return (
    <div className="visualWrap">
      <div className="visualGlow green" />

      <div className="packageTrail" />

      <div className="packagePin" />

      <div className="packageBox">
        <div className="boxTop" />
        <div className="boxFront" />
        <div className="boxSide" />
        <div className="boxTape" />
      </div>
    </div>
  )
}

/* ==========================================================================
   ANALYTICS VISUAL
   ========================================================================== */

function AnalyticsVisual() {
  return (
    <div className="visualWrap">
      <div className="visualGlow blue" />

      <div className="analyticsBase" />

      <div className="analyticsBars">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="analyticsRing" />

      <div className="analyticsLine">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

/* ==========================================================================
   THEME TOGGLE
   ========================================================================== */

function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light'

  return (
    <button
      type="button"
      className="themeToggle"
      onClick={onToggle}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      title={light ? 'Dark mode' : 'Light mode'}
    >
      <span className="themeToggleIcon">{light ? <MoonIcon /> : <SunIcon />}</span>
    </button>
  )
}

/* ==========================================================================
   SCREEN
   ========================================================================== */

function ScreenBg({ children, theme }) {
  return (
    <div className="screenBg" data-theme={theme}>
      {children}
    </div>
  )
}

/* ==========================================================================
   LOADERS
   ========================================================================== */

function Loader() {
  return (
    <div className="loaderShell">
      <div className="loader" />
    </div>
  )
}

function ButtonLoader() {
  return <span className="buttonLoader" />
}

/* ==========================================================================
   SVG
   ========================================================================== */

const Svg = ({ children, size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
)

/* ==========================================================================
   ICONS
   ========================================================================== */

function ArrowRightIcon() {
  return (
    <Svg size={18}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  )
}

function ShieldIcon() {
  return (
    <Svg size={20}>
      <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  )
}

function ChartSmallIcon() {
  return (
    <Svg size={20}>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-7" />
    </Svg>
  )
}

function UsersIcon() {
  return (
    <Svg size={20}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  )
}

function UserIcon() {
  return (
    <Svg size={18}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

function LockIcon() {
  return (
    <Svg size={18}>
      <rect x="4" y="10" width="16" height="11" rx="2" />

      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

function EyeIcon() {
  return (
    <Svg size={18}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Svg>
  )
}

function EyeOffIcon() {
  return (
    <Svg size={18}>
      <path d="m3 3 18 18" />
      <path d="M10.7 6.1A10.9 10.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.1 2.7" />
      <path d="M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4-.8" />
    </Svg>
  )
}

function AlertIcon() {
  return (
    <Svg size={17}>
      <circle cx="12" cy="12" r="9" />

      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </Svg>
  )
}

function LogoutIcon() {
  return (
    <Svg size={18}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  )
}

function SunIcon() {
  return (
    <Svg size={18}>
      <circle cx="12" cy="12" r="4" />

      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </Svg>
  )
}

function MoonIcon() {
  return (
    <Svg size={18}>
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" />
    </Svg>
  )
}
