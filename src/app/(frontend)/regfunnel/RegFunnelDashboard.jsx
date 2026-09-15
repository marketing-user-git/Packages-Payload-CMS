'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import styles from './RegFunnelDashboard.module.css'

const API = '/api/regfunnel/stats'
const USER_API = '/api/users/me'
const THEME_KEY = 'em-internal-theme'
const RANGES = [30, 90, 180, 365, 1000, 3650]
const STATES = ['in_progress', 'converted', 'completed', 'excluded']
const APP_LABELS = { global: 'Global', china: 'China' }
const STATE_LABELS = {
  in_progress: 'In Progress',
  converted: 'Converted',
  completed: 'Completed',
  excluded: 'Excluded',
}
const COUNTRY_CODE = {
  Cyprus: 'cy', China: 'cn', Japan: 'jp', 'United Kingdom': 'gb', UK: 'gb',
  Australia: 'au', Germany: 'de', France: 'fr', Spain: 'es', Italy: 'it',
  Canada: 'ca', USA: 'us', 'United States': 'us', Brazil: 'br', Portugal: 'pt',
  Greece: 'gr', Poland: 'pl', Austria: 'at', Switzerland: 'ch', Netherlands: 'nl',
  Sweden: 'se', Norway: 'no', Denmark: 'dk', Finland: 'fi', Ireland: 'ie',
  'South Africa': 'za', 'United Arab Emirates': 'ae', Singapore: 'sg', Malaysia: 'my',
  Thailand: 'th', Indonesia: 'id', Vietnam: 'vn', Philippines: 'ph', Mexico: 'mx',
  Chile: 'cl', Argentina: 'ar',
}

const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)
const fmt = (value) => Number(value || 0).toLocaleString()
const pct = (a, b, digits = 1) =>
  b > 0 ? `${((Number(a || 0) / Number(b)) * 100).toFixed(digits)}%` : '—'
const shortStep = (value) =>
  !value || value === '00_no_email_yet'
    ? 'Before first email'
    : String(value).replace(/^\d+_/, '').replaceAll('_', ' ')
const dateTime = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const relativeDue = (value) => {
  if (!value) return '—'
  const diff = new Date(value).getTime() - Date.now()
  const hours = Math.round(Math.abs(diff) / 3600000)
  if (hours < 1) return diff >= 0 ? 'Due soon' : 'Overdue'
  if (hours < 48) return diff >= 0 ? `In ${hours}h` : `${hours}h overdue`
  const days = Math.round(hours / 24)
  return diff >= 0 ? `In ${days}d` : `${days}d overdue`
}
const delta = (current, previous) => {
  const a = Number(current || 0)
  const b = Number(previous || 0)
  if (!b) return null
  return ((a - b) / b) * 100
}
const deltaLabel = (value) => {
  if (value == null || !Number.isFinite(value)) return 'No previous cohort'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}% vs. previous period`
}
const hoursLabel = (hours) => {
  if (hours == null || !Number.isFinite(Number(hours))) return '—'
  const value = Number(hours)
  return value < 24 ? `${value.toFixed(1)}h` : `${(value / 24).toFixed(1)}d`
}
const titleCase = (value) =>
  String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
const initialTheme = () => {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function Icon({ type, size = 18 }) {
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
    home: <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6" /><path d="M16 5c2 0 3 1.5 3 3s-1 3-3 3" /><path d="M17 14c3 .4 4 2.2 4 5" /></>,
    journey: <><path d="M4 7h10" /><path d="m11 4 3 3-3 3" /><path d="M20 17H10" /><path d="m13 14-3 3 3 3" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="7" r="2" /></>,
    flask: <><path d="M9 3h6" /><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M8 15h8" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    report: <><path d="M5 3h10l4 4v14H5z" /><path d="M14 3v5h5" /><path d="M8 16v2" /><path d="M12 13v5" /><path d="M16 11v7" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    export: <><path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 14v6h14v-6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>,
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />,
    open: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }
  return <svg {...common}>{paths[type] || paths.home}</svg>
}

function NavItem({ href, icon, label, sub, active }) {
  return (
    <a href={href} className={active ? styles.navActive : ''}>
      <span className={styles.navIcon}><Icon type={icon} size={18} /></span>
      <span><strong>{label}</strong><small>{sub}</small></span>
    </a>
  )
}

function StatusPill({ state }) {
  return <span className={`${styles.statusPill} ${styles[`status_${state}`]}`}>{STATE_LABELS[state] || state}</span>
}

function CountryFlag({ country }) {
  const code = COUNTRY_CODE[country]
  const fallback = code ? code.toUpperCase() : String(country || '—').slice(0, 2).toUpperCase()
  return (
    <span className={styles.flagFrame} aria-hidden="true">
      <span className={styles.flagFallback}>{fallback}</span>
      {code && (
        <img
          src={`https://flagcdn.com/w40/${code}.png`}
          alt=""
          loading="lazy"
          onError={(event) => { event.currentTarget.style.display = 'none' }}
        />
      )}
    </span>
  )
}

function FilterSelect({ label, value, onChange, options, icon }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selected = options.find((option) => String(option.value) === String(value)) || options[0]

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div className={styles.selectControl} ref={rootRef} style={{ overflow: 'visible', paddingLeft: icon ? 10 : 12 }}>
      {icon && <Icon type={icon} size={15} />}
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          color: 'var(--text-2)',
          fontSize: 12,
          fontWeight: 700,
          paddingRight: 10,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label}</span>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            flex: '0 0 7px',
            borderRight: '1.5px solid currentColor',
            borderBottom: '1.5px solid currentColor',
            transform: open ? 'rotate(225deg) translate(-2px,-2px)' : 'rotate(45deg) translate(-2px,-2px)',
            color: 'var(--subtle)',
            transition: 'transform .18s ease',
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 80,
            minWidth: 190,
            padding: 6,
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            background: 'var(--surface)',
            boxShadow: '0 18px 48px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.035)',
            backdropFilter: 'blur(18px)',
          }}
        >
          {options.map((option) => {
            const isSelected = String(option.value) === String(value)
            return (
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                key={String(option.value)}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  minHeight: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '0 10px',
                  border: 0,
                  borderRadius: 8,
                  background: isSelected ? 'color-mix(in srgb, var(--cyan) 12%, var(--surface-3))' : 'transparent',
                  color: isSelected ? 'var(--text)' : 'var(--text-2)',
                  font: 'inherit',
                  fontSize: 12,
                  fontWeight: isSelected ? 750 : 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseEnter={(event) => {
                  if (!isSelected) event.currentTarget.style.background = 'var(--surface-3)'
                }}
                onMouseLeave={(event) => {
                  if (!isSelected) event.currentTarget.style.background = 'transparent'
                }}
              >
                <span>{option.label}</span>
                {isSelected && <span style={{ color: 'var(--cyan-strong)', display: 'grid', placeItems: 'center' }}><Icon type="check" size={14} /></span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NotificationBell({ count, items }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count ? `${count} operational alerts` : 'Operational notifications'}
        title={count ? `${count} operational signal(s) need review` : 'Operational notifications'}
      >
        <Icon type="bell" size={18} />
        {count > 0 && <i className={styles.alertDot} />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Operational notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 9px)',
            right: 0,
            width: 360,
            maxWidth: 'calc(100vw - 24px)',
            zIndex: 90,
            overflow: 'hidden',
            border: '1px solid var(--border-strong)',
            borderRadius: 14,
            background: 'var(--surface)',
            boxShadow: '0 22px 58px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.035)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 15px 12px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <strong style={{ display: 'block', color: 'var(--text)', fontSize: 13.5 }}>Operational notifications</strong>
              <span style={{ display: 'block', marginTop: 3, color: 'var(--muted)', fontSize: 10.5 }}>Live signals from the selected cohort</span>
            </div>
            <span style={{ padding: '4px 8px', borderRadius: 999, background: count ? 'color-mix(in srgb, var(--red) 12%, transparent)' : 'color-mix(in srgb, var(--green) 10%, transparent)', color: count ? 'var(--red-strong)' : 'var(--green-strong)', fontSize: 10.5, fontWeight: 750 }}>
              {count ? `${count} open` : 'All clear'}
            </span>
          </div>

          <div style={{ padding: 7 }}>
            {items.length ? items.map((item) => (
              <a
                key={item.key}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr 16px',
                  gap: 10,
                  alignItems: 'start',
                  padding: '10px 9px',
                  borderRadius: 10,
                  color: 'var(--text-2)',
                  textDecoration: 'none',
                }}
                onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 9, background: `color-mix(in srgb, ${item.tone} 13%, transparent)`, color: item.tone, fontWeight: 850 }}>{item.icon}</span>
                <span>
                  <strong style={{ display: 'block', color: 'var(--text)', fontSize: 11.5 }}>{item.title}</strong>
                  <small style={{ display: 'block', marginTop: 3, color: 'var(--muted)', fontSize: 10.5, lineHeight: 1.45 }}>{item.text}</small>
                </span>
                <span style={{ color: 'var(--subtle)', fontSize: 14 }}>›</span>
              </a>
            )) : (
              <div style={{ padding: '22px 16px', textAlign: 'center' }}>
                <div style={{ width: 38, height: 38, margin: '0 auto 9px', display: 'grid', placeItems: 'center', borderRadius: 12, background: 'color-mix(in srgb, var(--green) 11%, transparent)', color: 'var(--green-strong)' }}><Icon type="check" size={18} /></div>
                <strong style={{ display: 'block', color: 'var(--text)', fontSize: 12.5 }}>No issues need attention</strong>
                <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 10.5 }}>Send health and sequence integrity look clear.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Sparkline({ data, dataKey, tone }) {
  if (!Array.isArray(data) || data.length < 2) return null
  return (
    <div className={styles.sparkline} aria-hidden="true">
      <LineChart width={82} height={42} data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={tone} strokeWidth={2.3} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  )
}

function Kpi({ label, value, previous, tone, icon, sparkData, sparkKey }) {
  const change = delta(value, previous)
  const hasSpark = Array.isArray(sparkData) && sparkData.length > 1
  return (
    <article className={`${styles.kpi} ${styles[`kpi_${tone}`]} ${hasSpark ? styles.kpiWithSpark : ''}`}>
      <div className={styles.kpiMain}>
        <span className={styles.kpiIcon}>{icon}</span>
        <div className={styles.kpiValue}><span>{label}</span><strong>{fmt(value)}</strong></div>
        {hasSpark && (
          <Sparkline
            data={sparkData}
            dataKey={sparkKey}
            tone={tone === 'red' ? '#e84f65' : tone === 'green' || tone === 'teal' ? '#1db982' : '#1188b5'}
          />
        )}
      </div>
      <div className={`${styles.kpiDelta} ${change != null && change < 0 ? styles.deltaDown : ''}`}>
        {deltaLabel(change)}
      </div>
    </article>
  )
}

function Panel({ title, sub, action, children, className = '' }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.panelHead}>
        <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        {action && <div className={styles.panelAction}>{action}</div>}
      </div>
      {children}
    </section>
  )
}

function sortValue(row, key) {
  const value = row?.[key]
  if (value == null) return ''
  if (String(key).includes('_at')) return new Date(value).getTime() || 0
  return String(value).toLowerCase()
}

export default function RegFunnelDashboard({ onBack, user, onLogout, theme: themeProp, onToggleTheme }) {
  const [days, setDays] = useState(1000)
  const [region, setRegion] = useState('All')
  const [app, setApp] = useState('All')
  const [variant, setVariant] = useState('All')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [abMetric, setAbMetric] = useState('conversion')
  const [trendMetric, setTrendMetric] = useState('enrolled')
  const [showSequence, setShowSequence] = useState(false)
  const [sortKey, setSortKey] = useState('enrolled_at')
  const [sortDir, setSortDir] = useState('desc')
  const [localTheme, setLocalTheme] = useState(initialTheme)
  const [resolvedUser, setResolvedUser] = useState(user || null)

  const theme = themeProp || localTheme
  const toggleTheme = onToggleTheme || (() => setLocalTheme((current) => (current === 'dark' ? 'light' : 'dark')))

  useEffect(() => {
    if (themeProp) return
    window.localStorage.setItem(THEME_KEY, localTheme)
  }, [localTheme, themeProp])

  useEffect(() => {
    if (user) {
      setResolvedUser(user)
      return
    }
    let cancelled = false
    fetch(USER_API, { credentials: 'include' })
      .then((response) => response.json())
      .then((body) => { if (!cancelled) setResolvedUser(body?.user || null) })
      .catch(() => { if (!cancelled) setResolvedUser(null) })
    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    let stop = false
    setLoading(true)
    setError('')
    fetch(`${API}?days=${days}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`)
        return body
      })
      .then((body) => { if (!stop) setStats(body) })
      .catch((err) => { if (!stop) setError(err?.message || 'Could not load RegFunnelOps data.') })
      .finally(() => { if (!stop) setLoading(false) })
    return () => { stop = true }
  }, [days])

  const data = stats || {}
  const sequences = data.sequences || { ROW: [], CNJP: [] }
  const matches = (row) =>
    (region === 'All' || row.funnel_region === region) &&
    (app === 'All' || row.os_app === app) &&
    (variant === 'All' || row.variant === variant)

  const states = (data.states || []).filter(matches)
  const previousStates = (data.previousStates || []).filter(matches)
  const engagement = (data.engagement || []).filter(matches)
  const currentByStep = (data.currentByStep || []).filter(matches)
  const convertedByStep = (data.convertedByStep || []).filter(matches)
  const filteredAbStats = (data.abStats || []).filter(
    (row) => (region === 'All' || row.funnel_region === region) && (app === 'All' || row.os_app === app),
  )
  const filteredStages = (data.funnelStages || []).filter(matches)

  const enrolled = sum(states, 'n')
  const previousEnrolled = sum(previousStates, 'n')
  const stateCounts = Object.fromEntries(STATES.map((state) => [state, sum(states.filter((row) => row.state === state), 'n')]))
  const previousCounts = Object.fromEntries(STATES.map((state) => [state, sum(previousStates.filter((row) => row.state === state), 'n')]))
  const sent = sum(engagement, 'sent')
  const delivered = sum(engagement, 'delivered')
  const noRecipient = sum(engagement, 'no_recipient')
  const sendErrors = sum(engagement, 'errors')
  const unsubscribed = sum(engagement, 'unsubscribed')
  const totalAttempts = sent + noRecipient + sendErrors
  const hasDeliveryEvents = delivered > 0

  const trend = useMemo(() => {
    const map = new Map()
    for (const row of (data.trend || []).filter(matches)) {
      const item = map.get(row.day) || { day: row.day, enrolled: 0, in_progress: 0, converted: 0, completed: 0, excluded: 0 }
      for (const key of ['enrolled', 'in_progress', 'converted', 'completed', 'excluded']) item[key] += Number(row[key] || 0)
      map.set(row.day, item)
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [data.trend, region, app, variant])

  const currentStepMap = useMemo(() => {
    const map = new Map()
    for (const row of currentByStep) map.set(row.step_id, (map.get(row.step_id) || 0) + Number(row.n || 0))
    return map
  }, [currentByStep])

  const selectedSequence = region === 'CNJP' ? sequences.CNJP || [] : sequences.ROW || []
  const emailSteps = selectedSequence.map((step, index) => ({ step, index: index + 1, active: currentStepMap.get(step) || 0 }))

  const stageTotals = {
    enrolled: sum(filteredStages, 'enrolled'),
    started: sum(filteredStages, 'started'),
    mid_journey: sum(filteredStages, 'mid_journey'),
    late_journey: sum(filteredStages, 'late_journey'),
    converted: sum(filteredStages, 'converted'),
    completed: sum(filteredStages, 'completed'),
  }
  const stages = [
    ['Enrolled', 'enrolled'], ['Started', 'started'], ['Mid Journey', 'mid_journey'],
    ['Final Stretch', 'late_journey'], ['Converted', 'converted'], ['Completed', 'completed'],
  ].map(([label, key]) => ({ label, key, value: stageTotals[key], rate: enrolled ? (stageTotals[key] / enrolled) * 100 : 0 }))
  const furthestReached = stages.reduce((last, stage, index) => (stage.value > 0 ? index : last), -1)

  const sendHealth = [
    { name: 'Sent', value: sent, tone: '#27c995' },
    { name: 'No recipient', value: noRecipient, tone: '#2d9ed0' },
    { name: 'Errors', value: sendErrors, tone: '#dc4d61' },
    { name: 'Unsubscribed', value: unsubscribed, tone: '#8a65d3' },
  ]

  const abRows = ['A', 'B']
    .filter((value) => variant === 'All' || variant === value)
    .map((value) => {
      const rows = filteredAbStats.filter((row) => row.variant === value)
      const n = sum(rows, 'enrolled')
      const converted = sum(rows, 'converted')
      const completed = sum(rows, 'completed')
      const weightedHoursNumerator = rows.reduce((total, row) => total + Number(row.avg_hours_to_convert || 0) * Number(row.converted || 0), 0)
      const avgHours = converted ? weightedHoursNumerator / converted : null
      return { variant: value, enrolled: n, converted, completed, conversionRate: n ? (converted / n) * 100 : 0, completionRate: n ? (completed / n) * 100 : 0, avgHours }
    })
  const metricValue = (row) => abMetric === 'completion' ? row.completionRate : abMetric === 'time' ? row.avgHours : row.conversionRate

  const countryRows = useMemo(() => {
    const map = new Map()
    for (const row of (data.countryPerformance || []).filter(matches)) {
      const item = map.get(row.country) || { country: row.country, total: 0, converted: 0 }
      item.total += Number(row.n || 0)
      if (row.state === 'converted') item.converted += Number(row.n || 0)
      map.set(row.country, item)
    }
    return [...map.values()]
      .map((row) => ({ ...row, rate: row.total ? (row.converted / row.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total || b.rate - a.rate)
      .slice(0, 6)
  }, [data.countryPerformance, region, app, variant])

  const conversionByStep = useMemo(() => {
    const map = new Map()
    for (const row of convertedByStep) {
      const value = Number(row.n || 0)
      if (value > 0) map.set(row.step_id, (map.get(row.step_id) || 0) + value)
    }
    return [...map.entries()].map(([step, value]) => ({ step: shortStep(step), value })).sort((a, b) => b.value - a.value)
  }, [convertedByStep])
  const conversionStepMax = Math.max(1, ...conversionByStep.map((row) => row.value))

  const recent = (data.recentEnrollments || []).filter((row) => {
    if (region !== 'All' && row.funnel_region !== region) return false
    if (app !== 'All' && row.os_app !== app) return false
    if (variant !== 'All' && row.variant !== variant) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = [row.external_id, row.country, row.culture, row.current_step, row.state, row.os_app, row.funnel_region].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const sortedRecent = [...recent].sort((a, b) => {
    const av = sortValue(a, sortKey)
    const bv = sortValue(b, sortKey)
    if (av === bv) return 0
    const result = av > bv ? 1 : -1
    return sortDir === 'asc' ? result : -result
  })
  const visibleRecent = sortedRecent.slice(0, 8)
  const legacySteps = engagement.filter((row) => !(sequences[row.funnel_region] || []).includes(row.step_id))
  const alerts = sendErrors + noRecipient + legacySteps.length
  const notificationItems = [
    ...(sendErrors > 0 ? [{ key: 'send-errors', title: 'Send errors', text: `${sendErrors} send error${sendErrors === 1 ? '' : 's'} need review in this cohort.`, href: '#send-health', tone: 'var(--red-strong)', icon: '!' }] : []),
    ...(noRecipient > 0 ? [{ key: 'no-recipient', title: 'No recipient', text: `${noRecipient} send attempt${noRecipient === 1 ? '' : 's'} had no eligible recipient.`, href: '#send-health', tone: 'var(--amber)', icon: '!' }] : []),
    ...(legacySteps.length > 0 ? [{ key: 'legacy-steps', title: 'Sequence integrity', text: `${legacySteps.length} engagement row${legacySteps.length === 1 ? '' : 's'} reference legacy steps.`, href: '#journey', tone: 'var(--red-strong)', icon: '!' }] : []),
    ...(sent > 0 && !hasDeliveryEvents ? [{ key: 'delivery', title: 'Delivery tracking unavailable', text: 'Emails were sent, but delivery events have not been captured yet.', href: '#send-health', tone: 'var(--blue)', icon: 'i' }] : []),
  ]
  const currentMetricValue = trendMetric === 'enrolled' ? enrolled : stateCounts[trendMetric] || 0
  const previousMetricValue = trendMetric === 'enrolled' ? previousEnrolled : previousCounts[trendMetric] || 0

  const displayName = resolvedUser?.name || resolvedUser?.username || 'Signed in'
  const displayRole = resolvedUser?.superAdmin
    ? 'Super Admin'
    : [resolvedUser?.department, resolvedUser?.level].filter(Boolean).map(titleCase).join(' · ') || 'User'

  const chartTheme = theme === 'light'
    ? { grid: 'rgba(18,55,75,.11)', tick: '#526b76', tooltipBg: '#ffffff', tooltipBorder: '#c5d2d8', tooltipText: '#102731' }
    : { grid: 'rgba(255,255,255,.08)', tick: '#a2b5c1', tooltipBg: '#0b2035', tooltipBorder: '#27485e', tooltipText: '#eef8ff' }

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const exportCsv = () => {
    const headers = ['External ID', 'Country', 'Culture', 'Region', 'App', 'Variant', 'State', 'Current Step', 'Next Send', 'Enrolled At']
    const rows = sortedRecent.map((row) => [row.external_id, row.country, row.culture, row.funnel_region, row.os_app, row.variant, row.state, row.current_step, row.next_send_at, row.enrolled_at])
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `regfunnel-enrollments-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className={styles.loading}>Loading live RegFunnelOps data…</div>
  if (error) return <div className={styles.errorBox}>RegFunnelOps could not load: {error}</div>

  return (
    <div className={styles.shell} data-theme={theme}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarGlow} aria-hidden="true" />
        <div className={styles.brand}>
          <div className={styles.brandMark}>RF</div>
          <div><strong>RegFunnelOps</strong><small>Marketing Operations</small></div>
        </div>
        <nav className={styles.nav} aria-label="RegFunnelOps navigation">
          <NavItem href="#overview" icon="home" label="Overview" sub="Key metrics & insights" active />
          <NavItem href="#enrollments" icon="users" label="Enrollments" sub="People in your funnel" />
          <NavItem href="#journey" icon="journey" label="Journey" sub="Funnel stages & email steps" />
          <NavItem href="#ab" icon="flask" label="A/B Tests" sub="Experiment results" />
          <NavItem href="#send-health" icon="mail" label="Sends & Errors" sub="Delivery and issues" />
          <NavItem href="/?app=analytics" icon="report" label="Reports" sub="Open Marketing Analytics" />
        </nav>
      </aside>

      <main className={styles.main} id="overview">
        <div className={styles.topbar}>
          <label className={styles.search}>
            <Icon type="search" size={17} />
            <input aria-label="Search recent enrollments" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recent enrollments…" />
          </label>

          <div className={styles.topFilters}>
            <FilterSelect
              label="Date range"
              icon="calendar"
              value={days}
              onChange={(next) => setDays(Number(next))}
              options={RANGES.map((item) => ({ value: item, label: `Last ${item} days` }))}
            />
            <FilterSelect
              label="OneSignal app"
              value={app}
              onChange={setApp}
              options={[{ value: 'All', label: 'All Apps' }, { value: 'global', label: 'Global' }, { value: 'china', label: 'China' }]}
            />
            <FilterSelect
              label="Funnel region"
              value={region}
              onChange={setRegion}
              options={[{ value: 'All', label: 'All Regions' }, { value: 'ROW', label: 'ROW' }, { value: 'CNJP', label: 'CN / JP' }]}
            />
            <FilterSelect
              label="A/B variant"
              value={variant}
              onChange={setVariant}
              options={[{ value: 'All', label: 'All Variants' }, { value: 'A', label: 'Variant A' }, { value: 'B', label: 'Variant B' }]}
            />

            <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              <Icon type={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>

            <NotificationBell count={alerts} items={notificationItems} />

            <div className={styles.userBox} title={`${displayName} · ${displayRole}`}>
              <div className={styles.avatar}>{displayName.charAt(0).toUpperCase()}</div>
              <div><strong>{displayName}</strong><small>{displayRole}</small></div>
            </div>

            {onBack && <button type="button" className={styles.appsBtn} onClick={onBack}>Apps</button>}
            {onLogout && <button type="button" className={styles.logoutBtn} onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button>}
          </div>
        </div>

        <section className={styles.kpiGrid} aria-label="Funnel metrics">
          <Kpi label="Enrolled" value={enrolled} previous={previousEnrolled} tone="cyan" icon="◎" sparkData={trend} sparkKey="enrolled" />
          <Kpi label="In Progress" value={stateCounts.in_progress} previous={previousCounts.in_progress} tone="blue" icon="▶" sparkData={trend} sparkKey="in_progress" />
          <Kpi label="Converted" value={stateCounts.converted} previous={previousCounts.converted} tone="green" icon="▥" sparkData={trend} sparkKey="converted" />
          <Kpi label="Completed" value={stateCounts.completed} previous={previousCounts.completed} tone="teal" icon="✓" sparkData={trend} sparkKey="completed" />
          <Kpi label="Excluded" value={stateCounts.excluded} previous={previousCounts.excluded} tone="red" icon="⊘" sparkData={trend} sparkKey="excluded" />
        </section>

        <section className={styles.topGrid}>
          <Panel title="Funnel Journey" sub="High-level progression across the registration sequence" className={styles.journeyPanel} action={<button type="button" className={styles.textAction} onClick={() => setShowSequence((value) => !value)}>{showSequence ? 'Hide email steps' : 'View full journey'} →</button>}>
            <div className={styles.stageFlow} id="journey">
              {stages.map((stage, index) => {
                const stateClass = index < furthestReached ? styles.stageReached : index === furthestReached ? styles.stageCurrent : styles.stageFuture
                return <div className={`${styles.stage} ${stateClass}`} key={stage.key}><span>{index + 1}</span><strong>{stage.label}</strong><b>{fmt(stage.value)}</b><small>{stage.rate.toFixed(0)}%</small></div>
              })}
            </div>
            {showSequence && (
              <div className={styles.emailSequence}>
                <div className={styles.sequenceHeader}><strong>{region === 'CNJP' ? 'CN / JP' : 'ROW'} email sequence</strong><span>{emailSteps.length} live steps</span></div>
                <div className={styles.sequenceScroll}>
                  {emailSteps.map((item) => <div className={styles.emailStep} key={item.step}><span>{item.index}</span><strong title={item.step}>{shortStep(item.step)}</strong><small>{item.active ? `${item.active} active` : 'No active users'}</small></div>)}
                </div>
              </div>
            )}
            {trend.length > 1 ? (
              <div className={styles.miniChart}><ResponsiveContainer width="100%" height={82}><BarChart data={trend.slice(-24)}><Bar dataKey="enrolled" fill="#149db8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
            ) : <div className={styles.miniEmpty}>Trend will appear after another enrollment date.</div>}
          </Panel>

          <Panel title="Send Health" sub="Delivery and send outcomes" className={styles.sendPanel} action={<span>{sent === 0 ? 'No sends' : hasDeliveryEvents ? `${pct(delivered, sent)} delivered` : 'Delivery events unavailable'}</span>}>
            <div className={styles.sendHealth} id="send-health">
              <div className={styles.donut}>
                <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={sendHealth} dataKey="value" innerRadius={56} outerRadius={76} paddingAngle={2}>{sendHealth.map((item) => <Cell key={item.name} fill={item.tone} />)}</Pie></PieChart></ResponsiveContainer>
                <div className={styles.donutCenter}><strong>{fmt(totalAttempts)}</strong><span>Total attempts</span></div>
              </div>
              <div className={styles.legend}>{sendHealth.map((item) => <div key={item.name}><i style={{ background: item.tone }} /><span>{item.name}<small>{pct(item.value, totalAttempts)}</small></span><strong>{fmt(item.value)}</strong></div>)}</div>
            </div>
            <div className={`${styles.healthNote} ${sendErrors > 0 ? styles.healthWarn : ''}`}>
              {sendErrors > 0 ? `${sendErrors} send error(s) need review.` : sent > 0 && !hasDeliveryEvents ? 'Send attempts look healthy. Delivery events are not being recorded yet.' : 'Send health is stable.'}
            </div>
          </Panel>

          <Panel title="Variant Performance" sub="Real sequence-level outcomes" className={styles.abPanel}>
            <div className={styles.metricTabs} id="ab" role="tablist" aria-label="Variant performance metric">
              <button type="button" role="tab" aria-selected={abMetric === 'conversion'} className={abMetric === 'conversion' ? styles.tabActive : ''} onClick={() => setAbMetric('conversion')}>Conversion Rate</button>
              <button type="button" role="tab" aria-selected={abMetric === 'completion'} className={abMetric === 'completion' ? styles.tabActive : ''} onClick={() => setAbMetric('completion')}>Completion Rate</button>
              <button type="button" role="tab" aria-selected={abMetric === 'time'} className={abMetric === 'time' ? styles.tabActive : ''} onClick={() => setAbMetric('time')}>Time to Convert</button>
            </div>
            <div className={styles.abList}>{abRows.map((row) => {
              const value = metricValue(row)
              const width = abMetric === 'time' ? 0 : Math.min(100, Number(value || 0))
              return <div className={styles.abRow} key={row.variant}><div className={`${styles.variantBadge} ${row.variant === 'B' ? styles.variantB : ''}`}>{row.variant}</div><div className={styles.abBody}><div><strong>Variant {row.variant}</strong><span>{fmt(row.enrolled)} enrolled</span></div>{abMetric !== 'time' && <div className={styles.progress}><i style={{ width: `${width}%` }} /></div>}<small>{abMetric === 'time' ? `${fmt(row.converted)} converted` : `${fmt(abMetric === 'completion' ? row.completed : row.converted)} / ${fmt(row.enrolled)}`}</small></div><strong>{abMetric === 'time' ? hoursLabel(value) : `${Number(value || 0).toFixed(1)}%`}</strong></div>
            })}</div>
          </Panel>
        </section>

        <section className={styles.midGrid}>
          <Panel title="Performance Over Time" sub="Filtered enrollment cohort trend" className={`${styles.performancePanel} ${trend.length < 2 ? styles.performancePanelEmpty : ''}`} action={<div className={styles.performanceAction}><FilterSelect label="Performance metric" value={trendMetric} onChange={setTrendMetric} options={[{ value: 'enrolled', label: 'Enrollments' }, { value: 'converted', label: 'Conversions' }, { value: 'completed', label: 'Completions' }, { value: 'excluded', label: 'Exclusions' }]} /><span className={delta(currentMetricValue, previousMetricValue) != null && delta(currentMetricValue, previousMetricValue) < 0 ? styles.deltaDown : styles.deltaUp}>{deltaLabel(delta(currentMetricValue, previousMetricValue))}</span></div>}>
            {trend.length > 1 ? (
              <ResponsiveContainer width="100%" height={235}><LineChart data={trend}><CartesianGrid stroke={chartTheme.grid} vertical={false} /><XAxis dataKey="day" tick={{ fill: chartTheme.tick, fontSize: 11 }} minTickGap={26} /><YAxis tick={{ fill: chartTheme.tick, fontSize: 11 }} width={38} /><Tooltip contentStyle={{ background: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: 10, color: chartTheme.tooltipText }} /><Line type="monotone" dataKey={trendMetric} stroke="#1188b5" strokeWidth={2.6} dot={{ r: 2, fill: '#1188b5' }} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer>
            ) : <div className={styles.chartEmptyLarge}><strong>Trend not available yet</strong><span>At least two enrollment dates are needed. This will populate automatically as new users enroll.</span></div>}
          </Panel>

          <Panel title="Top Insights" sub="Live operational signals" className={styles.insightsPanel}>
            <div className={styles.insights}>
              <div><i className={styles.good}>↗</i><span><strong>Conversion rate</strong><small>{pct(stateCounts.converted, enrolled)} of the selected cohort has converted.</small></span><em>Live</em></div>
              <div><i className={sendErrors ? styles.bad : styles.good}>!</i><span><strong>Send errors</strong><small>{sendErrors ? `${sendErrors} error(s) recorded in SendLog.` : 'No send errors in this cohort.'}</small></span><em>Live</em></div>
              <div><i className={sent > 0 && !hasDeliveryEvents ? styles.warn : styles.info}>i</i><span><strong>Delivery tracking</strong><small>{sent > 0 && !hasDeliveryEvents ? 'Emails were sent, but delivery events have not been captured yet.' : `${fmt(delivered)} delivered event(s) recorded.`}</small></span><em>Live</em></div>
              <div><i className={legacySteps.length ? styles.bad : styles.info}>✓</i><span><strong>Sequence integrity</strong><small>{legacySteps.length ? `${legacySteps.length} legacy step row(s) detected.` : 'All engagement rows match the live sequences.'}</small></span><em>Live</em></div>
            </div>
          </Panel>

          <Panel title="Regional Performance" sub="Enrollment and conversion by country" className={styles.regionPanel}>
            <div className={styles.regionList}>{countryRows.length ? countryRows.map((row) => <div className={styles.regionRow} key={row.country}><div className={styles.regionIdentity}><CountryFlag country={row.country} /><span><strong>{row.country}</strong><small>{fmt(row.total)} enrolled · {fmt(row.converted)} converted</small></span></div><div className={styles.regionBar}><i style={{ width: `${Math.min(100, row.rate)}%` }} /></div><strong className={styles.regionRate}>{row.rate.toFixed(1)}%</strong></div>) : <div className={styles.noCountry}>No country data in this cohort.</div>}</div>
          </Panel>
        </section>

        {conversionByStep.length > 0 && (
          <Panel title="Conversions by Step" sub="Last email sent before conversion" className={styles.conversionPanel}>
            <div className={styles.conversionList} role="list" aria-label="Conversions by last email step">{conversionByStep.map((row) => <div className={styles.conversionRow} role="listitem" key={row.step}><span className={styles.conversionLabel} title={row.step}>{titleCase(row.step)}</span><div className={styles.conversionTrack} aria-hidden="true"><i style={{ width: `${Math.max(8, (row.value / conversionStepMax) * 100)}%` }} /></div><strong>{fmt(row.value)} conversion{row.value === 1 ? '' : 's'}</strong></div>)}</div>
          </Panel>
        )}

        <Panel title="Recent Enrollments" sub="Search and inspect the latest users in the selected cohort" className={styles.enrollmentPanel} action={<div className={styles.tableActions}><button type="button" onClick={exportCsv}><Icon type="export" size={15} /> Export</button><a href="/admin/collections/funnel-enrollment">View all enrollments →</a></div>}>
          <div className={styles.tableWrap} id="enrollments">
            <table>
              <thead><tr>{[['external_id', 'External ID'], ['country', 'Country'], ['funnel_region', 'Region'], ['os_app', 'App'], ['variant', 'Variant'], ['state', 'State'], ['current_step', 'Current Step'], ['next_send_at', 'Next Send'], ['enrolled_at', 'Enrolled At']].map(([key, label]) => <th key={key} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => toggleSort(key)}>{label}<span>{sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span></button></th>)}<th><span className={styles.srOnly}>Actions</span></th></tr></thead>
              <tbody>
                {!visibleRecent.length && <tr><td colSpan={10} className={styles.empty}>{search ? 'No recent enrollments match your search.' : 'No enrollments in this cohort.'}</td></tr>}
                {visibleRecent.map((row) => <tr key={row.external_id}><td><strong>{row.external_id}</strong></td><td><span className={styles.countryCell}><CountryFlag country={row.country} /> {row.country || '—'}</span></td><td>{row.funnel_region === 'CNJP' ? 'CN / JP' : row.funnel_region}</td><td>{APP_LABELS[row.os_app] || row.os_app}</td><td><b className={styles.variantText}>{row.variant}</b></td><td><StatusPill state={row.state} /></td><td title={row.current_step}><span className={styles.stepPill}>{shortStep(row.current_step)}</span></td><td className={row.next_send_at && new Date(row.next_send_at) < new Date() ? styles.overdue : ''}>{relativeDue(row.next_send_at)}</td><td>{dateTime(row.enrolled_at)}</td><td><a className={styles.rowAction} href={`/admin/collections/funnel-enrollment/${row.id}`} title={`Open enrollment ${row.external_id}`} aria-label={`Open enrollment ${row.external_id}`}><Icon type="open" size={15} /></a></td></tr>)}
              </tbody>
            </table>
          </div>
          <div className={styles.tableFooter}><span>Showing {visibleRecent.length} of {recent.length} loaded enrollments</span>{recent.length > visibleRecent.length && <a href="/admin/collections/funnel-enrollment">Open full enrollment list</a>}</div>
        </Panel>

        <footer className={styles.footer}>Live RegFunnelOps data · cohort basis: {data.cohortBasis || 'enrolledAt'} · generated {dateTime(data.generatedAt)}</footer>
      </main>
    </div>
  )
}
