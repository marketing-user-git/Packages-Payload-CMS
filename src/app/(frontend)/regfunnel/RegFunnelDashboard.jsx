'use client'

import { useEffect, useMemo, useState } from 'react'
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
const RANGES = [30, 90, 180, 365, 1000, 3650]
const STATES = ['in_progress', 'converted', 'completed', 'excluded']
const APP_LABELS = { global: 'Global', china: 'China' }
const STATE_LABELS = {
  in_progress: 'In Progress',
  converted: 'Converted',
  completed: 'Completed',
  excluded: 'Excluded',
}
const FLAG = {
  Cyprus: '🇨🇾',
  China: '🇨🇳',
  Japan: '🇯🇵',
  'United Kingdom': '🇬🇧',
  UK: '🇬🇧',
  Australia: '🇦🇺',
  Germany: '🇩🇪',
  France: '🇫🇷',
  Spain: '🇪🇸',
  Italy: '🇮🇹',
  Canada: '🇨🇦',
  USA: '🇺🇸',
  'United States': '🇺🇸',
  Brazil: '🇧🇷',
  Portugal: '🇵🇹',
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
  if (value < 24) return `${value.toFixed(1)}h`
  return `${(value / 24).toFixed(1)}d`
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
  }
  const paths = {
    home: (
      <>
        <path d="M3 11 12 3l9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2-6 6-6s6 2 6 6" />
        <path d="M16 5c2 0 3 1.5 3 3s-1 3-3 3" />
        <path d="M17 14c3 .4 4 2.2 4 5" />
      </>
    ),
    journey: (
      <>
        <path d="M4 7h10" />
        <path d="m11 4 3 3-3 3" />
        <path d="M20 17H10" />
        <path d="m13 14-3 3 3 3" />
        <circle cx="5" cy="17" r="2" />
        <circle cx="19" cy="7" r="2" />
      </>
    ),
    flask: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        <path d="M8 15h8" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </>
    ),
    report: (
      <>
        <path d="M5 3h10l4 4v14H5z" />
        <path d="M14 3v5h5" />
        <path d="M8 16v2" />
        <path d="M12 13v5" />
        <path d="M16 11v7" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    export: (
      <>
        <path d="M12 3v12" />
        <path d="m8 7 4-4 4 4" />
        <path d="M5 14v6h14v-6" />
      </>
    ),
  }
  return <svg {...common}>{paths[type] || paths.home}</svg>
}

function NavItem({ href, icon, label, sub, active }) {
  return (
    <a href={href} className={active ? styles.navActive : ''}>
      <span className={styles.navIcon}>
        <Icon type={icon} size={17} />
      </span>
      <span>
        <strong>{label}</strong>
        <small>{sub}</small>
      </span>
    </a>
  )
}

function StatusPill({ state }) {
  return (
    <span className={`${styles.statusPill} ${styles[`status_${state}`]}`}>
      {STATE_LABELS[state] || state}
    </span>
  )
}

function Sparkline({ data, dataKey, tone }) {
  if (!Array.isArray(data) || data.length < 2) {
    return <div className={styles.sparkEmpty} />
  }

  return (
    <div className={styles.sparkline}>
      <LineChart width={72} height={38} data={data}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={tone}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  )
}

function Kpi({ label, value, previous, tone, icon, sparkData, sparkKey }) {
  const change = delta(value, previous)
  return (
    <div className={`${styles.kpi} ${styles[`kpi_${tone}`]}`}>
      <div className={styles.kpiMain}>
        <span className={styles.kpiIcon}>{icon}</span>
        <div>
          <span>{label}</span>
          <strong>{fmt(value)}</strong>
        </div>
        <Sparkline
          data={sparkData}
          dataKey={sparkKey}
          tone={
            tone === 'red' ? '#ff6173' : tone === 'green' || tone === 'teal' ? '#31e6b5' : '#2bc8ff'
          }
        />
      </div>
      <div className={`${styles.kpiDelta} ${change != null && change < 0 ? styles.deltaDown : ''}`}>
        {deltaLabel(change)}
      </div>
    </div>
  )
}

function Panel({ title, sub, action, children, className = '' }) {
  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.panelHead}>
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
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

export default function RegFunnelDashboard({ onBack, user, onLogout }) {
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
      .then((body) => {
        if (!stop) setStats(body)
      })
      .catch((err) => {
        if (!stop) setError(err?.message || 'Could not load RegFunnelOps data.')
      })
      .finally(() => {
        if (!stop) setLoading(false)
      })
    return () => {
      stop = true
    }
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
    (row) =>
      (region === 'All' || row.funnel_region === region) && (app === 'All' || row.os_app === app),
  )
  const filteredStages = (data.funnelStages || []).filter(matches)

  const enrolled = sum(states, 'n')
  const previousEnrolled = sum(previousStates, 'n')
  const stateCounts = Object.fromEntries(
    STATES.map((state) => [
      state,
      sum(
        states.filter((row) => row.state === state),
        'n',
      ),
    ]),
  )
  const previousCounts = Object.fromEntries(
    STATES.map((state) => [
      state,
      sum(
        previousStates.filter((row) => row.state === state),
        'n',
      ),
    ]),
  )
  const sent = sum(engagement, 'sent')
  const delivered = sum(engagement, 'delivered')
  const noRecipient = sum(engagement, 'no_recipient')
  const sendErrors = sum(engagement, 'errors')
  const unsubscribed = sum(engagement, 'unsubscribed')
  const totalAttempts = sent + noRecipient + sendErrors

  const trend = useMemo(() => {
    const map = new Map()
    for (const row of (data.trend || []).filter(matches)) {
      const item = map.get(row.day) || {
        day: row.day,
        enrolled: 0,
        in_progress: 0,
        converted: 0,
        completed: 0,
        excluded: 0,
      }
      for (const key of ['enrolled', 'in_progress', 'converted', 'completed', 'excluded'])
        item[key] += Number(row[key] || 0)
      map.set(row.day, item)
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
  }, [data.trend, region, app, variant])

  const currentStepMap = useMemo(() => {
    const map = new Map()
    for (const row of currentByStep)
      map.set(row.step_id, (map.get(row.step_id) || 0) + Number(row.n || 0))
    return map
  }, [currentByStep])

  const selectedSequence = region === 'CNJP' ? sequences.CNJP || [] : sequences.ROW || []
  const emailSteps = selectedSequence.map((step, index) => ({
    step,
    index: index + 1,
    active: currentStepMap.get(step) || 0,
  }))

  const stageTotals = {
    enrolled: sum(filteredStages, 'enrolled'),
    started: sum(filteredStages, 'started'),
    mid_journey: sum(filteredStages, 'mid_journey'),
    late_journey: sum(filteredStages, 'late_journey'),
    converted: sum(filteredStages, 'converted'),
    completed: sum(filteredStages, 'completed'),
  }
  const stages = [
    ['Enrolled', 'enrolled'],
    ['Started', 'started'],
    ['Mid Journey', 'mid_journey'],
    ['Final Stretch', 'late_journey'],
    ['Converted', 'converted'],
    ['Completed', 'completed'],
  ].map(([label, key]) => ({
    label,
    key,
    value: stageTotals[key],
    rate: enrolled ? (stageTotals[key] / enrolled) * 100 : 0,
  }))

  const sendHealth = [
    { name: 'Sent', value: sent, tone: '#31e6b5' },
    { name: 'No recipient', value: noRecipient, tone: '#3ab8ff' },
    { name: 'Errors', value: sendErrors, tone: '#ff5f73' },
    { name: 'Unsubscribed', value: unsubscribed, tone: '#a778ff' },
  ]

  const abRows = ['A', 'B']
    .filter((v) => variant === 'All' || variant === v)
    .map((v) => {
      const rows = filteredAbStats.filter((row) => row.variant === v)
      const n = sum(rows, 'enrolled')
      const converted = sum(rows, 'converted')
      const completed = sum(rows, 'completed')
      const weightedHoursNumerator = rows.reduce(
        (total, row) => total + Number(row.avg_hours_to_convert || 0) * Number(row.converted || 0),
        0,
      )
      const avgHours = converted ? weightedHoursNumerator / converted : null
      return {
        variant: v,
        enrolled: n,
        converted,
        completed,
        conversionRate: n ? (converted / n) * 100 : 0,
        completionRate: n ? (completed / n) * 100 : 0,
        avgHours,
      }
    })
  const aRow = abRows.find((row) => row.variant === 'A')
  const bRow = abRows.find((row) => row.variant === 'B')
  const metricValue = (row) =>
    abMetric === 'completion'
      ? row.completionRate
      : abMetric === 'time'
        ? row.avgHours
        : row.conversionRate
  const aMetric = aRow ? metricValue(aRow) : null
  const bMetric = bRow ? metricValue(bRow) : null
  const lift =
    aMetric && bMetric != null
      ? abMetric === 'time'
        ? ((aMetric - bMetric) / aMetric) * 100
        : ((bMetric - aMetric) / aMetric) * 100
      : null

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
    for (const row of convertedByStep)
      map.set(row.step_id, (map.get(row.step_id) || 0) + Number(row.n || 0))
    return [...map.entries()].map(([step, value]) => ({ step: shortStep(step), value }))
  }, [convertedByStep])

  const recent = (data.recentEnrollments || []).filter((row) => {
    if (region !== 'All' && row.funnel_region !== region) return false
    if (app !== 'All' && row.os_app !== app) return false
    if (variant !== 'All' && row.variant !== variant) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = [
        row.external_id,
        row.country,
        row.culture,
        row.current_step,
        row.state,
        row.os_app,
        row.funnel_region,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  const sortedRecent = [...recent].sort((a, b) => {
    const av = sortValue(a, sortKey),
      bv = sortValue(b, sortKey)
    if (av === bv) return 0
    const result = av > bv ? 1 : -1
    return sortDir === 'asc' ? result : -result
  })
  const visibleRecent = sortedRecent.slice(0, 8)

  const legacySteps = engagement.filter(
    (row) => !(sequences[row.funnel_region] || []).includes(row.step_id),
  )
  const alerts = sendErrors + noRecipient + legacySteps.length
  const currentMetricValue = trendMetric === 'enrolled' ? enrolled : stateCounts[trendMetric] || 0
  const previousMetricValue =
    trendMetric === 'enrolled' ? previousEnrolled : previousCounts[trendMetric] || 0

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const exportCsv = () => {
    const headers = [
      'External ID',
      'Country',
      'Culture',
      'Region',
      'App',
      'Variant',
      'State',
      'Current Step',
      'Next Send',
      'Enrolled At',
    ]
    const rows = sortedRecent.map((row) => [
      row.external_id,
      row.country,
      row.culture,
      row.funnel_region,
      row.os_app,
      row.variant,
      row.state,
      row.current_step,
      row.next_send_at,
      row.enrolled_at,
    ])
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n')
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
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>RF</div>
          <div>
            <strong>RegFunnelOps</strong>
            <small>Marketing Operations</small>
          </div>
        </div>
        <nav className={styles.nav}>
          <NavItem
            href="#overview"
            icon="home"
            label="Overview"
            sub="Key metrics & insights"
            active
          />
          <NavItem
            href="#enrollments"
            icon="users"
            label="Enrollments"
            sub="People in your funnel"
          />
          <NavItem
            href="#journey"
            icon="journey"
            label="Journey"
            sub="Funnel stages & email steps"
          />
          <NavItem href="#ab" icon="flask" label="A/B Tests" sub="Experiment results" />
          <NavItem
            href="#send-health"
            icon="mail"
            label="Sends & Errors"
            sub="Delivery and issues"
          />
          <NavItem
            href="/?app=analytics"
            icon="report"
            label="Reports"
            sub="Open Marketing Analytics"
          />
        </nav>
        <div className={styles.sidebarQuote}>
          <strong>
            Smarter Journeys.
            <br />
            Higher Impact.
          </strong>
          <span>Automate. Learn. Convert.</span>
        </div>
      </aside>

      <main className={styles.main} id="overview">
        <div className={styles.topbar}>
          <label className={styles.search}>
            <Icon type="search" size={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users, enrollments or steps…"
            />
          </label>
          <div className={styles.topFilters}>
            <label className={styles.dateSelect}>
              <Icon type="calendar" size={15} />
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {RANGES.map((v) => (
                  <option key={v} value={v}>
                    Last {v} days
                  </option>
                ))}
              </select>
            </label>
            <select value={app} onChange={(e) => setApp(e.target.value)}>
              <option value="All">All Apps</option>
              <option value="global">Global</option>
              <option value="china">China</option>
            </select>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="All">All Regions</option>
              <option value="ROW">ROW</option>
              <option value="CNJP">CN / JP</option>
            </select>
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              <option value="All">All Variants</option>
              <option value="A">Variant A</option>
              <option value="B">Variant B</option>
            </select>
            <button
              className={styles.alertBtn}
              title={
                alerts
                  ? `${alerts} operational signal(s) need review`
                  : 'No current send or sequence alerts'
              }
            >
              <Icon type="bell" size={17} />
              {alerts > 0 && <i />}
            </button>
            <div className={styles.userBox}>
              <div className={styles.avatar}>
                {String(user?.name || user?.username || 'M')
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div>
                <strong>{user?.name || user?.username || 'Marketing Ops'}</strong>
                <small>Marketing Ops</small>
              </div>
            </div>
            {onBack && (
              <button className={styles.appsBtn} onClick={onBack}>
                Apps
              </button>
            )}
            {onLogout && (
              <button className={styles.logoutBtn} onClick={onLogout} title="Sign out">
                ↗
              </button>
            )}
          </div>
        </div>

        <header className={styles.hero}>
          <div>
            <h1>RegFunnelOps</h1>
            <p>Monitor. Optimize. Move people forward.</p>
          </div>
          <span>LESS FRICTION. MORE PEOPLE FORWARD.</span>
        </header>

        <section className={styles.kpiGrid}>
          <Kpi
            label="Enrolled"
            value={enrolled}
            previous={previousEnrolled}
            tone="cyan"
            icon="◎"
            sparkData={trend}
            sparkKey="enrolled"
          />
          <Kpi
            label="In Progress"
            value={stateCounts.in_progress}
            previous={previousCounts.in_progress}
            tone="blue"
            icon="▶"
            sparkData={trend}
            sparkKey="in_progress"
          />
          <Kpi
            label="Converted"
            value={stateCounts.converted}
            previous={previousCounts.converted}
            tone="green"
            icon="▥"
            sparkData={trend}
            sparkKey="converted"
          />
          <Kpi
            label="Completed"
            value={stateCounts.completed}
            previous={previousCounts.completed}
            tone="teal"
            icon="✓"
            sparkData={trend}
            sparkKey="completed"
          />
          <Kpi
            label="Excluded"
            value={stateCounts.excluded}
            previous={previousCounts.excluded}
            tone="red"
            icon="⊘"
            sparkData={trend}
            sparkKey="excluded"
          />
        </section>

        <section className={styles.topGrid}>
          <Panel
            title="Funnel Journey"
            sub="High-level progression across the registration sequence"
            className={styles.journeyPanel}
            action={
              <button
                className={styles.textAction}
                onClick={() => setShowSequence((value) => !value)}
              >
                {showSequence ? 'Hide email steps' : 'View full journey'} →
              </button>
            }
          >
            <div className={styles.stageFlow} id="journey">
              {stages.map((stage, index) => (
                <div
                  className={`${styles.stage} ${index === 0 ? styles.stageActive : ''}`}
                  key={stage.key}
                >
                  <span>{index + 1}</span>
                  <strong>{stage.label}</strong>
                  <b>{fmt(stage.value)}</b>
                  <small>{stage.rate.toFixed(0)}%</small>
                </div>
              ))}
            </div>
            {showSequence && (
              <div className={styles.emailSequence}>
                <div className={styles.sequenceHeader}>
                  <strong>{region === 'CNJP' ? 'CN / JP' : 'ROW'} email sequence</strong>
                  <span>{emailSteps.length} live steps</span>
                </div>
                <div className={styles.sequenceScroll}>
                  {emailSteps.map((item) => (
                    <div className={styles.emailStep} key={item.step}>
                      <span>{item.index}</span>
                      <strong title={item.step}>{shortStep(item.step)}</strong>
                      <small>{item.active ? `${item.active} active` : 'No active users'}</small>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.miniChart}>
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height={96}>
                  <BarChart data={trend.slice(-24)}>
                    <Bar dataKey="enrolled" fill="#28d6b4" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className={styles.chartEmpty}>
                  More enrollment dates are needed to build a trend.
                </div>
              )}
            </div>
          </Panel>

          <Panel
            title="Send Health"
            sub="Delivery and send outcomes"
            className={styles.sendPanel}
            action={<span>{pct(delivered, sent)} delivered</span>}
          >
            <div className={styles.sendHealth} id="send-health">
              <div className={styles.donut}>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={sendHealth}
                      dataKey="value"
                      innerRadius={55}
                      outerRadius={76}
                      paddingAngle={2}
                    >
                      {sendHealth.map((item) => (
                        <Cell key={item.name} fill={item.tone} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutCenter}>
                  <strong>{fmt(totalAttempts)}</strong>
                  <span>Total attempts</span>
                </div>
              </div>
              <div className={styles.legend}>
                {sendHealth.map((item) => (
                  <div key={item.name}>
                    <i style={{ background: item.tone }} />
                    <span>
                      {item.name}
                      <small>{pct(item.value, totalAttempts)}</small>
                    </span>
                    <strong>{fmt(item.value)}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${styles.healthNote} ${sendErrors > 0 ? styles.healthWarn : ''}`}>
              {sendErrors > 0
                ? `${sendErrors} send error(s) need review.`
                : sent > 0 && delivered === 0
                  ? 'Sends are healthy. Delivery events are not recorded yet.'
                  : 'Send health is stable.'}
            </div>
          </Panel>

          <Panel
            title="A/B Test Performance"
            sub="Real sequence-level outcomes"
            className={styles.abPanel}
          >
            <div className={styles.metricTabs} id="ab">
              <button
                className={abMetric === 'conversion' ? styles.tabActive : ''}
                onClick={() => setAbMetric('conversion')}
              >
                Conversion Rate
              </button>
              <button
                className={abMetric === 'completion' ? styles.tabActive : ''}
                onClick={() => setAbMetric('completion')}
              >
                Completion Rate
              </button>
              <button
                className={abMetric === 'time' ? styles.tabActive : ''}
                onClick={() => setAbMetric('time')}
              >
                Time to Convert
              </button>
            </div>
            <div className={styles.abList}>
              {abRows.map((row) => {
                const value = metricValue(row)
                const width = abMetric === 'time' ? 0 : Math.min(100, Number(value || 0))
                return (
                  <div className={styles.abRow} key={row.variant}>
                    <div
                      className={`${styles.variantBadge} ${row.variant === 'B' ? styles.variantB : ''}`}
                    >
                      {row.variant}
                    </div>
                    <div className={styles.abBody}>
                      <div>
                        <strong>Variant {row.variant}</strong>
                        <span>{row.variant === 'A' ? 'Current (Control)' : 'Challenger'}</span>
                      </div>
                      {abMetric !== 'time' && (
                        <div className={styles.progress}>
                          <i style={{ width: `${width}%` }} />
                        </div>
                      )}
                      <small>
                        {abMetric === 'time'
                          ? `${fmt(row.converted)} converted`
                          : `${fmt(abMetric === 'completion' ? row.completed : row.converted)} / ${fmt(row.enrolled)}`}
                      </small>
                    </div>
                    <strong>
                      {abMetric === 'time'
                        ? hoursLabel(value)
                        : `${Number(value || 0).toFixed(1)}%`}
                    </strong>
                    {row.variant === 'B' && lift != null && (
                      <em className={lift >= 0 ? styles.liftGood : styles.liftBad}>
                        {lift >= 0 ? '+' : ''}
                        {lift.toFixed(1)}%
                      </em>
                    )}
                  </div>
                )
              })}
            </div>
            <div className={styles.abFoot}>
              {abRows.reduce((t, r) => t + r.enrolled, 0) < 30
                ? 'Sample is still too small for a reliable winner.'
                : lift == null
                  ? 'Both variants need measurable results before lift can be calculated.'
                  : `Variant B ${lift >= 0 ? 'is ahead' : 'is behind'} by ${Math.abs(lift).toFixed(1)}% on this metric.`}
            </div>
          </Panel>
        </section>

        <section className={styles.midGrid}>
          <Panel
            title="Performance Over Time"
            sub="Filtered enrollment cohort trend"
            className={styles.performancePanel}
            action={
              <div className={styles.performanceAction}>
                <select value={trendMetric} onChange={(e) => setTrendMetric(e.target.value)}>
                  <option value="enrolled">Enrollments</option>
                  <option value="converted">Conversions</option>
                  <option value="completed">Completions</option>
                  <option value="excluded">Exclusions</option>
                </select>
                <span
                  className={
                    delta(currentMetricValue, previousMetricValue) != null &&
                    delta(currentMetricValue, previousMetricValue) < 0
                      ? styles.deltaDown
                      : styles.deltaUp
                  }
                >
                  {deltaLabel(delta(currentMetricValue, previousMetricValue))}
                </span>
              </div>
            }
          >
            {trend.length > 1 ? (
              <ResponsiveContainer width="100%" height={235}>
                <LineChart data={trend}>
                  <defs>
                    <linearGradient id="rfLineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2bc8ff" stopOpacity=".35" />
                      <stop offset="100%" stopColor="#2bc8ff" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#718ba1', fontSize: 10 }} minTickGap={26} />
                  <YAxis tick={{ fill: '#718ba1', fontSize: 10 }} width={34} />
                  <Tooltip
                    contentStyle={{
                      background: '#0b2035',
                      border: '1px solid #1c3b56',
                      borderRadius: 10,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={trendMetric}
                    stroke="#29c9ff"
                    strokeWidth={2.4}
                    dot={{ r: 2, fill: '#29c9ff' }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.chartEmptyLarge}>
                <strong>Trend not available yet</strong>
                <span>
                  Your test cohort has only one enrollment date. This chart will populate
                  automatically as new users enroll.
                </span>
              </div>
            )}
          </Panel>

          <Panel
            title="Top Insights"
            sub="Live operational signals"
            className={styles.insightsPanel}
          >
            <div className={styles.insights}>
              <div>
                <i className={styles.good}>↗</i>
                <span>
                  <strong>Conversion rate</strong>
                  <small>
                    {pct(stateCounts.converted, enrolled)} of the selected cohort has converted.
                  </small>
                </span>
                <em>Live</em>
              </div>
              <div>
                <i className={sendErrors ? styles.bad : styles.good}>!</i>
                <span>
                  <strong>Send errors</strong>
                  <small>
                    {sendErrors
                      ? `${sendErrors} error(s) recorded in SendLog.`
                      : 'No send errors in this cohort.'}
                  </small>
                </span>
                <em>Live</em>
              </div>
              <div>
                <i className={sent > 0 && delivered === 0 ? styles.bad : styles.info}>i</i>
                <span>
                  <strong>Delivery tracking</strong>
                  <small>
                    {sent > 0 && delivered === 0
                      ? 'Emails were sent, but delivery events have not been captured yet.'
                      : `${fmt(delivered)} delivered event(s) recorded.`}
                  </small>
                </span>
                <em>Live</em>
              </div>
              <div>
                <i className={legacySteps.length ? styles.bad : styles.info}>✓</i>
                <span>
                  <strong>Sequence integrity</strong>
                  <small>
                    {legacySteps.length
                      ? `${legacySteps.length} legacy step row(s) detected.`
                      : 'All engagement rows match the live sequences.'}
                  </small>
                </span>
                <em>Live</em>
              </div>
            </div>
          </Panel>

          <Panel
            title="Regional Performance"
            sub="Conversion rate by country"
            className={styles.regionPanel}
            action={<span>Conversions</span>}
          >
            <div className={styles.regionList}>
              {countryRows.length ? (
                countryRows.map((row) => (
                  <div key={row.country}>
                    <span>
                      <b>{FLAG[row.country] || '🌐'}</b>
                      {row.country}
                    </span>
                    <div className={styles.regionBar}>
                      <i style={{ width: `${Math.min(100, row.rate)}%` }} />
                    </div>
                    <strong>{row.rate.toFixed(1)}%</strong>
                  </div>
                ))
              ) : (
                <div className={styles.noCountry}>No country data in this cohort.</div>
              )}
            </div>
          </Panel>
        </section>

        {conversionByStep.length > 0 && (
          <Panel title="Conversions by Step" sub="Last email sent before conversion">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={conversionByStep} layout="vertical">
                <CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#758da6', fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="step"
                  width={150}
                  tick={{ fill: '#9bb0c3', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0b2035',
                    border: '1px solid #1c3b56',
                    borderRadius: 10,
                  }}
                />
                <Bar dataKey="value" fill="#31e6b5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        <Panel
          title="Recent Enrollments"
          sub="Search and inspect the latest users in the selected cohort"
          className={styles.enrollmentPanel}
          action={
            <div className={styles.tableActions}>
              <button onClick={exportCsv}>
                <Icon type="export" size={14} /> Export
              </button>
              <a href="/admin/collections/funnel-enrollment">View all enrollments →</a>
            </div>
          }
        >
          <div className={styles.tableWrap} id="enrollments">
            <table>
              <thead>
                <tr>
                  {[
                    ['external_id', 'External ID'],
                    ['country', 'Country'],
                    ['funnel_region', 'Region'],
                    ['os_app', 'App'],
                    ['variant', 'Variant'],
                    ['state', 'State'],
                    ['current_step', 'Current Step'],
                    ['next_send_at', 'Next Send'],
                    ['enrolled_at', 'Enrolled At'],
                  ].map(([key, label]) => (
                    <th key={key}>
                      <button onClick={() => toggleSort(key)}>
                        {label}
                        <span>{sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {!visibleRecent.length && (
                  <tr>
                    <td colSpan={10} className={styles.empty}>
                      {search
                        ? 'No recent enrollments match your search.'
                        : 'No enrollments in this cohort.'}
                    </td>
                  </tr>
                )}
                {visibleRecent.map((row) => (
                  <tr key={row.external_id}>
                    <td>
                      <strong>{row.external_id}</strong>
                    </td>
                    <td>
                      <span className={styles.countryCell}>
                        {FLAG[row.country] || '🌐'} {row.country || '—'}
                      </span>
                    </td>
                    <td>{row.funnel_region === 'CNJP' ? 'CN / JP' : row.funnel_region}</td>
                    <td>{APP_LABELS[row.os_app] || row.os_app}</td>
                    <td>
                      <b className={styles.variantText}>{row.variant}</b>
                    </td>
                    <td>
                      <StatusPill state={row.state} />
                    </td>
                    <td title={row.current_step}>{shortStep(row.current_step)}</td>
                    <td
                      className={
                        row.next_send_at && new Date(row.next_send_at) < new Date()
                          ? styles.overdue
                          : ''
                      }
                    >
                      {relativeDue(row.next_send_at)}
                    </td>
                    <td>{dateTime(row.enrolled_at)}</td>
                    <td>
                      <a
                        className={styles.rowAction}
                        href={`/admin/collections/funnel-enrollment/${row.id}`}
                        title="Open enrollment"
                      >
                        •••
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.tableFooter}>
            <span>
              Showing {visibleRecent.length} of {recent.length} loaded enrollments
            </span>
            {recent.length > visibleRecent.length && (
              <a href="/admin/collections/funnel-enrollment">Open full enrollment list</a>
            )}
          </div>
        </Panel>

        <footer className={styles.footer}>
          Live RegFunnelOps data · cohort basis: {data.cohortBasis || 'enrolledAt'} · generated{' '}
          {dateTime(data.generatedAt)}
        </footer>
      </main>
    </div>
  )
}
