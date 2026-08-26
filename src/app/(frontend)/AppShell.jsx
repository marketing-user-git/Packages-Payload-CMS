'use client'

import { useState, useEffect, useCallback } from 'react'
import { Dashboard, LOGO_B64 } from './Dashboard'
import AnalyticsDashboard from './AnalyticsDashboard'

// ─────────────────────────────────────────────────────────────────────────────
// Brand / theme
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  green: '#84c561',
  greenDark: '#6aad49',
  greenSoft: '#b9ef8d',

  blue: '#2b8cff',
  blueDark: '#075c8f',
  blueSoft: '#7dc4ff',

  text: '#ffffff',
  textSoft: 'rgba(255,255,255,.72)',
  textMuted: 'rgba(255,255,255,.50)',

  navy0: '#020b18',
  navy1: '#06162a',
  navy2: '#0c2744',

  white: '#ffffff',
  border: 'rgba(255,255,255,.13)',
  borderSoft: 'rgba(255,255,255,.08)',

  inputBorder: '#dbe4ea',
  inputText: '#213547',
  danger: '#d93b3b',
}

const API = '/api'

// ─────────────────────────────────────────────────────────────────────────────
// Session mapping
// ─────────────────────────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
export default function AppShell() {
  const [user, setUser] = useState(undefined)
  const [app, setApp] = useState(null)

  const fetchMe = useCallback(async () => {
    try {
      const r = await fetch(`${API}/users/me`, { credentials: 'include' })
      const d = await r.json()
      setUser(d?.user || null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  useEffect(() => {
    if (!user) return

    const p = canSeePackages(user)
    const a = canSeeAnalytics(user)

    if (p && !a) setApp('packages')
    else if (a && !p) setApp('analytics')
  }, [user])

  const logout = useCallback(async () => {
    try {
      await fetch(`${API}/users/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } catch {}
    setUser(null)
    setApp(null)
  }, [])

  if (user === undefined) {
    return (
      <ScreenBg>
        <GlobalStyles />
        <Loader />
      </ScreenBg>
    )
  }

  if (!user) return <LoginScreen onAuthed={fetchMe} />

  if (app === 'packages') {
    return <Dashboard session={toPackagesSession(user)} onLogout={logout} />
  }

  if (app === 'analytics') {
    return (
      <AnalyticsDashboard
        user={user}
        onBack={user.superAdmin ? () => setApp(null) : null}
        onLogout={logout}
      />
    )
  }

  return <AppPicker user={user} onPick={setApp} onLogout={logout} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ onAuthed }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!username.trim() || !password) {
      setErr('Please enter your username and password.')
      return
    }

    setLoading(true)
    setErr('')

    try {
      const r = await fetch(`${API}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: username.trim().toLowerCase(),
          password,
        }),
      })

      if (r.ok) {
        await onAuthed()
      } else {
        setErr('Incorrect username or password. Please try again.')
        setLoading(false)
      }
    } catch {
      setErr('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  return (
    <ScreenBg>
      <GlobalStyles />

      <div className="loginWrap">
        <div className="loginGlass">
          <div className="loginBrand">
            <img
              src={`data:image/svg+xml;base64,${LOGO_B64}`}
              alt="easyMarkets"
              className="brandLogoDark"
            />
          </div>

          <div className="loginTitle">Sign in</div>
          <div className="loginSubtitle">Internal tools · easyMarkets</div>

          <div className="formGroup">
            <label className="label">Username</label>
            <input
              value={username}
              autoFocus
              onChange={(e) => {
                setUsername(e.target.value)
                setErr('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="e.g. natalia.a"
              className="field"
            />
          </div>

          <div className="formGroup">
            <label className="label">Password</label>
            <div className="passwordWrap">
              <input
                value={password}
                type={show ? 'text' : 'password'}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErr('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="••••••••"
                className="field"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="showBtn"
                tabIndex={-1}
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {err && <div className="errorBox">{err}</div>}

          <button onClick={submit} disabled={loading} className="primaryAction">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </div>
    </ScreenBg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App Picker
// ─────────────────────────────────────────────────────────────────────────────
function AppPicker({ user, onPick, onLogout }) {
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
    <ScreenBg>
      <GlobalStyles />

      <div className="pickerFrame">
        <div className="pickerPanel">
          <div className="panelGlow panelGlowLeft" />
          <div className="panelGlow panelGlowRight" />
          <div className="waveDots waveDotsLeft" />
          <div className="waveDots waveDotsRight" />

          <header className="pickerHeader">
            <div className="pickerBrand">
              <img
                src={`data:image/svg+xml;base64,${LOGO_B64}`}
                alt="easyMarkets"
                className="brandLogoLight"
              />
            </div>

            <div className="pickerUser">
              <span className="userName">{user.name || user.username}</span>
              <span className="userDot">|</span>
              <button className="signOutLink" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </header>

          <main className="pickerMain">
            <h1 className="mainTitle">Choose an app</h1>
            <p className="mainSubtitle">You have access to the following tools.</p>

            <div
              className="cardsGrid"
              style={{
                gridTemplateColumns: tiles.length > 1 ? '1fr 1fr' : '1fr',
              }}
            >
              {tiles.map((tile) => (
                <button
                  key={tile.id}
                  onClick={() => onPick(tile.id)}
                  className={`appCard ${tile.accent}`}
                >
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

                  <div className="cardBottomAccent" />
                </button>
              ))}
            </div>

            <div className="trustRow">
              <div className="trustItem">
                <div className="trustIcon">
                  <ShieldIcon />
                </div>
                <div className="trustText">
                  <strong>Secure & reliable</strong>
                  <span>enterprise platform</span>
                </div>
              </div>

              <div className="trustDivider" />

              <div className="trustItem">
                <div className="trustIcon">
                  <ChartSmallIcon />
                </div>
                <div className="trustText">
                  <strong>Real-time insights</strong>
                  <span>that drive results</span>
                </div>
              </div>

              <div className="trustDivider" />

              <div className="trustItem">
                <div className="trustIcon">
                  <UsersIcon />
                </div>
                <div className="trustText">
                  <strong>Built for performance</strong>
                  <span>and collaboration</span>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ScreenBg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Visuals for cards
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Layout / helpers
// ─────────────────────────────────────────────────────────────────────────────
function ScreenBg({ children }) {
  return <div className="screenBg">{children}</div>
}

function Loader() {
  return (
    <div className="loaderShell">
      <div className="loader" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      button, input { font: inherit; }
      button { -webkit-tap-highlight-color: transparent; }

      .screenBg {
        min-height: 100vh;
        width: 100%;
        overflow: hidden;
        position: relative;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: Roboto, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 12% 85%, rgba(132,197,97,.22), transparent 22%),
          radial-gradient(circle at 92% 10%, rgba(125,196,255,.28), transparent 22%),
          linear-gradient(120deg, ${C.navy0} 0%, ${C.navy1} 48%, ${C.navy2} 100%);
      }

      .screenBg::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at 85% 15%, rgba(255,255,255,.06), transparent 18%),
          radial-gradient(circle at 15% 80%, rgba(255,255,255,.03), transparent 16%);
      }

      /* Loader */
      .loaderShell {
        width: 54px;
        height: 54px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.05);
        display: grid;
        place-items: center;
        backdrop-filter: blur(16px);
      }

      .loader {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid rgba(255,255,255,.18);
        border-top-color: ${C.green};
        animation: emspin .8s linear infinite;
      }

      @keyframes emspin {
        to { transform: rotate(360deg); }
      }

      /* Login */
      .loginWrap {
        width: 100%;
        display: grid;
        place-items: center;
      }

      .loginGlass {
        width: 380px;
        max-width: 100%;
        border-radius: 20px;
        padding: 32px;
        background: rgba(255,255,255,.92);
        box-shadow: 0 18px 60px rgba(0,0,0,.22);
      }

      .loginBrand {
        margin-bottom: 22px;
      }

      .brandLogoDark {
        height: 34px;
        width: auto;
      }

      .brandLogoLight {
        height: 38px;
        width: auto;
        
      }

      .loginTitle {
        font-size: 24px;
        line-height: 1.2;
        font-weight: 800;
        color: #223444;
        margin-bottom: 4px;
      }

      .loginSubtitle {
        font-size: 13px;
        color: #6d7d8a;
        margin-bottom: 24px;
      }

      .formGroup { margin-bottom: 14px; }

      .label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: #687887;
        margin-bottom: 6px;
      }

      .field {
        width: 100%;
        height: 46px;
        border-radius: 10px;
        border: 1px solid ${C.inputBorder};
        padding: 0 12px;
        font-size: 14px;
        color: ${C.inputText};
        outline: none;
        background: #fff;
      }

      .field:focus {
        border-color: ${C.green};
        box-shadow: 0 0 0 4px rgba(132,197,97,.12);
      }

      .passwordWrap {
        position: relative;
      }

      .showBtn {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: #728291;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
      }

      .errorBox {
        margin-top: 10px;
        color: ${C.danger};
        font-size: 13px;
      }

      .primaryAction {
        width: 100%;
        height: 48px;
        margin-top: 20px;
        border: none;
        border-radius: 12px;
        background: linear-gradient(135deg, ${C.greenDark}, ${C.green});
        color: #fff;
        font-size: 15px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 12px 28px rgba(106,173,73,.28);
      }

      .primaryAction:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      .primaryAction:disabled {
        opacity: .7;
        cursor: default;
      }

      /* Picker */
      .pickerFrame {
        width: min(1340px, 94vw);
      }

      .pickerPanel {
        position: relative;
        overflow: hidden;
        border-radius: 28px;
        border: 1px solid rgba(255,255,255,.12);
        background:
          linear-gradient(90deg, rgba(4,17,34,.92) 0%, rgba(5,25,48,.92) 44%, rgba(8,40,70,.78) 100%);
        box-shadow:
          0 30px 80px rgba(0,0,0,.35),
          inset 0 1px 0 rgba(255,255,255,.06);
        backdrop-filter: blur(18px);
      }

      .panelGlow {
        position: absolute;
        border-radius: 999px;
        filter: blur(70px);
        pointer-events: none;
      }

      .panelGlowLeft {
        width: 320px;
        height: 320px;
        left: -100px;
        bottom: -120px;
        background: rgba(132,197,97,.22);
      }

      .panelGlowRight {
        width: 360px;
        height: 360px;
        right: -120px;
        top: -80px;
        background: rgba(125,196,255,.28);
      }

      .waveDots {
        position: absolute;
        width: 260px;
        height: 180px;
        opacity: .28;
        pointer-events: none;
        background-image: radial-gradient(rgba(255,255,255,.55) 1px, transparent 1px);
        background-size: 9px 9px;
        mask-repeat: no-repeat;
        -webkit-mask-repeat: no-repeat;
      }

      .waveDotsLeft {
        left: -40px;
        bottom: 60px;
        mask-image: radial-gradient(ellipse at left bottom, black 0%, transparent 72%);
        -webkit-mask-image: radial-gradient(ellipse at left bottom, black 0%, transparent 72%);
      }

      .waveDotsRight {
        right: -40px;
        bottom: 80px;
        mask-image: radial-gradient(ellipse at right bottom, black 0%, transparent 72%);
        -webkit-mask-image: radial-gradient(ellipse at right bottom, black 0%, transparent 72%);
      }

      .pickerHeader {
        position: relative;
        z-index: 2;
        min-height: 120px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 28px 52px 12px;
      }

      .pickerBrand {
        display: flex;
        align-items: center;
        gap: 18px;
      }

      .brandDivider {
        width: 1px;
        height: 42px;
        background: rgba(255,255,255,.20);
      }

      .yearsBlock {
        display: flex;
        align-items: flex-end;
        gap: 6px;
        color: rgba(255,255,255,.92);
      }

      .yearsNumber {
        font-size: 48px;
        line-height: .9;
        font-weight: 800;
        letter-spacing: -2px;
        color: rgba(255,255,255,.95);
        text-shadow: 0 0 16px rgba(255,255,255,.08);
      }

      .yearsLabel {
        font-size: 14px;
        line-height: 1;
        font-weight: 700;
        letter-spacing: .4px;
        margin-bottom: 5px;
        color: rgba(255,255,255,.82);
      }

      .pickerUser {
        font-size: 14px;
        color: rgba(255,255,255,.78);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .userName {
        color: rgba(255,255,255,.78);
      }

      .userDot {
        color: rgba(255,255,255,.38);
      }

      .signOutLink {
        border: none;
        background: none;
        padding: 0;
        color: ${C.blueSoft};
        cursor: pointer;
        font-size: 14px;
        font-weight: 700;
      }

      .pickerMain {
        position: relative;
        z-index: 2;
        padding: 18px 52px 40px;
      }

      .mainTitle {
        margin: 0 0 10px;
        font-size: 58px;
        line-height: 1.02;
        letter-spacing: -2.6px;
        font-weight: 800;
        color: ${C.text};
      }

      .mainSubtitle {
        margin: 0 0 34px;
        font-size: 16px;
        color: ${C.textSoft};
      }

      .cardsGrid {
        display: grid;
        gap: 18px;
      }

      .appCard {
        position: relative;
        min-height: 265px;
        overflow: hidden;
        text-align: left;
        border-radius: 22px;
        border: 1px solid rgba(255,255,255,.12);
        background: linear-gradient(145deg, rgba(255,255,255,.10), rgba(255,255,255,.05));
        padding: 22px 22px 20px;
        cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
        backdrop-filter: blur(12px);
        transition:
          transform .18s ease,
          border-color .18s ease,
          box-shadow .18s ease,
          background .18s ease;
      }

      .appCard.green {
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.06),
          0 0 0 1px rgba(132,197,97,.10);
      }

      .appCard.blue {
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.06),
          0 0 0 1px rgba(43,140,255,.08);
      }

      .appCard:hover {
        transform: translateY(-4px);
      }

      .appCard.green:hover {
        border-color: rgba(132,197,97,.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 18px 36px rgba(0,0,0,.16),
          0 0 0 1px rgba(132,197,97,.16);
      }

      .appCard.blue:hover {
        border-color: rgba(43,140,255,.28);
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,.08),
          0 18px 36px rgba(0,0,0,.16),
          0 0 0 1px rgba(43,140,255,.14);
      }

      .cardTop {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .cardTag {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 1.5px;
        color: rgba(255,255,255,.42);
      }

      .arrowCircle {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        border: 1px solid rgba(255,255,255,.18);
        color: rgba(255,255,255,.70);
        background: rgba(255,255,255,.02);
      }

      .arrowCircle.green {
        border-color: rgba(132,197,97,.35);
      }

      .arrowCircle.blue {
        border-color: rgba(43,140,255,.35);
      }

      .cardVisualZone {
        height: 96px;
        margin: 18px 0 16px;
        position: relative;
      }

      .cardCopy {
        position: relative;
        z-index: 2;
      }

      .cardTitle {
        font-size: 22px;
        line-height: 1.15;
        font-weight: 800;
        color: rgba(255,255,255,.96);
        margin-bottom: 8px;
      }

      .cardDesc {
        font-size: 14px;
        line-height: 1.55;
        color: rgba(255,255,255,.70);
        max-width: 410px;
      }

      .cardBottomAccent {
        position: absolute;
        left: 0;
        bottom: 0;
        height: 4px;
        width: 180px;
        border-radius: 0 8px 8px 0;
      }

      .appCard.green .cardBottomAccent {
        background: linear-gradient(90deg, rgba(132,197,97,.95), rgba(132,197,97,0));
      }

      .appCard.blue .cardBottomAccent {
        background: linear-gradient(90deg, rgba(43,140,255,.95), rgba(43,140,255,0));
      }

      /* Package visual */
      .visualWrap {
        position: relative;
        width: 100%;
        height: 100%;
      }

      .visualGlow {
        position: absolute;
        width: 120px;
        height: 120px;
        border-radius: 50%;
        filter: blur(30px);
        opacity: .4;
        left: 8px;
        top: -10px;
      }

      .visualGlow.green {
        background: rgba(132,197,97,.32);
      }

      .visualGlow.blue {
        background: rgba(84,152,255,.32);
      }

      .packageTrail {
        position: absolute;
        left: 34px;
        top: 45px;
        width: 112px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid rgba(132,197,97,.38);
        border-top-color: transparent;
        border-left-color: transparent;
        transform: rotate(-14deg);
        box-shadow: 0 0 18px rgba(132,197,97,.16);
      }

      .packagePin {
        position: absolute;
        left: 128px;
        top: 2px;
        width: 28px;
        height: 36px;
        background: linear-gradient(180deg, ${C.greenSoft}, ${C.green});
        border-radius: 18px 18px 18px 0;
        transform: rotate(45deg);
        box-shadow: 0 8px 20px rgba(132,197,97,.28);
      }

      .packagePin::after {
        content: "";
        position: absolute;
        left: 7px;
        top: 7px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: rgba(255,255,255,.92);
      }

      .packageBox {
        position: absolute;
        left: 18px;
        bottom: 0;
        width: 82px;
        height: 62px;
        transform: perspective(400px) rotateX(12deg);
      }

      .boxFront {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 54px;
        height: 42px;
        background: linear-gradient(180deg, #e7c18e, #c89259);
        border-radius: 4px;
        box-shadow: 0 8px 20px rgba(0,0,0,.20);
      }

      .boxSide {
        position: absolute;
        left: 52px;
        bottom: 0;
        width: 28px;
        height: 42px;
        background: linear-gradient(180deg, #d9ac74, #b9844d);
        transform: skewY(-22deg);
        transform-origin: left bottom;
        border-radius: 2px 4px 4px 2px;
      }

      .boxTop {
        position: absolute;
        left: 6px;
        bottom: 38px;
        width: 58px;
        height: 18px;
        background: linear-gradient(180deg, #f2d3a7, #dcb279);
        transform: skewX(-35deg);
        border-radius: 4px;
      }

      .boxTape {
        position: absolute;
        left: 24px;
        bottom: 32px;
        width: 12px;
        height: 30px;
        background: linear-gradient(180deg, #a2db74, #6fb249);
        border-radius: 3px;
        transform: skewX(-10deg);
      }

      /* Analytics visual */
      .analyticsBase {
        position: absolute;
        left: 10px;
        bottom: 4px;
        width: 120px;
        height: 18px;
        background: linear-gradient(180deg, rgba(107,145,255,.35), rgba(107,145,255,.14));
        border-radius: 8px;
        box-shadow: 0 10px 24px rgba(43,140,255,.15);
      }

      .analyticsBars {
        position: absolute;
        left: 24px;
        bottom: 22px;
        display: flex;
        align-items: flex-end;
        gap: 10px;
      }

      .analyticsBars span {
        width: 18px;
        border-radius: 6px 6px 2px 2px;
        box-shadow: 0 10px 18px rgba(43,140,255,.12);
      }

      .analyticsBars span:nth-child(1) {
        height: 28px;
        background: linear-gradient(180deg, #87d698, #55b96e);
      }

      .analyticsBars span:nth-child(2) {
        height: 46px;
        background: linear-gradient(180deg, #76c8ff, #429cff);
      }

      .analyticsBars span:nth-child(3) {
        height: 62px;
        background: linear-gradient(180deg, #8d91ff, #5f67ff);
      }

      .analyticsBars span:nth-child(4) {
        height: 76px;
        background: linear-gradient(180deg, #b582ff, #7f59ff);
      }

      .analyticsRing {
        position: absolute;
        left: 92px;
        top: 4px;
        width: 58px;
        height: 58px;
        border-radius: 50%;
        border: 10px solid rgba(184,130,255,.80);
        border-left-color: rgba(76,152,255,.18);
        transform: rotate(-25deg);
        box-shadow: 0 8px 24px rgba(127,89,255,.12);
      }

      .analyticsLine {
        position: absolute;
        left: 16px;
        top: 16px;
        width: 124px;
        height: 58px;
      }

      .analyticsLine::before {
        content: "";
        position: absolute;
        left: 8px;
        top: 36px;
        width: 98px;
        height: 2px;
        background: linear-gradient(90deg, rgba(120,190,255,.10), rgba(120,190,255,.75));
        transform: rotate(-16deg);
        transform-origin: left center;
      }

      .analyticsLine i {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #8fd6ff;
        box-shadow: 0 0 12px rgba(143,214,255,.80);
      }

      .analyticsLine i:nth-child(1) {
        left: 10px;
        top: 40px;
      }

      .analyticsLine i:nth-child(2) {
        left: 56px;
        top: 20px;
      }

      .analyticsLine i:nth-child(3) {
        left: 104px;
        top: 8px;
      }

      /* Trust row */
      .trustRow {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 28px;
        margin-top: 30px;
        padding-top: 10px;
      }

      .trustItem {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .trustIcon {
        color: rgba(255,255,255,.62);
        display: grid;
        place-items: center;
      }

      .trustText strong,
      .trustText span {
        display: block;
      }

      .trustText strong {
        font-size: 13px;
        line-height: 1.2;
        font-weight: 700;
        color: rgba(255,255,255,.74);
      }

      .trustText span {
        font-size: 12px;
        line-height: 1.2;
        color: rgba(255,255,255,.46);
        margin-top: 3px;
      }

      .trustDivider {
        width: 1px;
        height: 34px;
        background: rgba(255,255,255,.10);
      }

      /* Responsive */
      @media (max-width: 980px) {
        .pickerHeader {
          padding: 24px 26px 10px;
          flex-direction: column;
          align-items: flex-start;
          gap: 18px;
        }

        .pickerUser {
          align-self: flex-end;
        }

        .pickerMain {
          padding: 18px 26px 30px;
        }

        .mainTitle {
          font-size: 42px;
        }

        .trustRow {
          flex-direction: column;
          gap: 16px;
          align-items: flex-start;
        }

        .trustDivider {
          display: none;
        }
      }

      @media (max-width: 720px) {
        .screenBg {
          padding: 16px;
        }

        .pickerFrame {
          width: 100%;
        }

        .pickerBrand {
          gap: 12px;
          flex-wrap: wrap;
        }

        .brandLogoLight {
          height: 32px;
        }

        .yearsNumber {
          font-size: 36px;
        }

        .yearsLabel {
          font-size: 12px;
        }

        .pickerUser {
          align-self: flex-start;
          font-size: 13px;
        }

        .mainTitle {
          font-size: 36px;
          letter-spacing: -1.5px;
        }

        .mainSubtitle {
          font-size: 14px;
        }

        .cardsGrid {
          grid-template-columns: 1fr !important;
        }

        .appCard {
          min-height: 250px;
        }

        .cardTitle {
          font-size: 20px;
        }

        .cardDesc {
          font-size: 13px;
        }
      }
    `}</style>
  )
}
