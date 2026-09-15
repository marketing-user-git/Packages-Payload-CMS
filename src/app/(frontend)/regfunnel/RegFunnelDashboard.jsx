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

const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)
const fmt = (value) => Number(value || 0).toLocaleString()
const pct = (a, b, digits = 1) => (b > 0 ? `${((Number(a || 0) / Number(b)) * 100).toFixed(digits)}%` : '—')
const shortStep = (value) => {
  if (!value || value === '00_no_email_yet') return 'Before first email'
  return String(value).replace(/^\d+_/, '').replaceAll('_', ' ')
}
const dateTime = (value) => (value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
const relativeDue = (value) => {
  if (!value) return '—'
  const diff = new Date(value).getTime() - Date.now()
  const abs = Math.abs(diff)
  const hours = Math.round(abs / 3600000)
  if (hours < 1) return diff >= 0 ? 'Due soon' : 'Overdue'
  if (hours < 48) return diff >= 0 ? `In ${hours}h` : `${hours}h overdue`
  const days = Math.round(hours / 24)
  return diff >= 0 ? `In ${days}d` : `${days}d overdue`
}

function Icon({ children }) {
  return <span className={styles.icon}>{children}</span>
}

function StatusPill({ state }) {
  return <span className={`${styles.statusPill} ${styles[`status_${state}`]}`}>{STATE_LABELS[state] || state}</span>
}

function Kpi({ label, value, note, tone, icon }) {
  return (
    <div className={`${styles.kpi} ${styles[`kpi_${tone}`]}`}>
      <div className={styles.kpiTop}>
        <Icon>{icon}</Icon>
        <div>
          <span>{label}</span>
          <strong>{fmt(value)}</strong>
        </div>
      </div>
      <small>{note}</small>
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

export default function RegFunnelDashboard({ onBack }) {
  const [days, setDays] = useState(1000)
  const [region, setRegion] = useState('All')
  const [app, setApp] = useState('All')
  const [variant, setVariant] = useState('All')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`${API}?days=${days}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`)
        return body
      })
      .then((body) => {
        if (!cancelled) setStats(body)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not load RegFunnelOps data.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [days])

  const data = stats || {}
  const sequences = data.sequences || { ROW: [], CNJP: [] }
  const filters = { region, app, variant }

  const matches = (row) =>
    (filters.region === 'All' || row.funnel_region === filters.region) &&
    (filters.app === 'All' || row.os_app === filters.app) &&
    (filters.variant === 'All' || row.variant === filters.variant)

  const states = (data.states || []).filter(matches)
  const engagement = (data.engagement || []).filter(matches)
  const currentByStep = (data.currentByStep || []).filter(matches)
  const convertedByStep = (data.convertedByStep || []).filter(matches)

  const enrolled = sum(states, 'n')
  const stateCounts = Object.fromEntries(
    STATES.map((state) => [state, sum(states.filter((row) => row.state === state), 'n')]),
  )

  const sent = sum(engagement, 'sent')
  const delivered = sum(engagement, 'delivered')
  const noRecipient = sum(engagement, 'no_recipient')
  const sendErrors = sum(engagement, 'errors')
  const unsubscribed = sum(engagement, 'unsubscribed')

  const sendHealth = [
    { name: 'Sent', value: sent, tone: '#31e6b5' },
    { name: 'No recipient', value: noRecipient, tone: '#3ab8ff' },
    { name: 'Errors', value: sendErrors, tone: '#ff5f73' },
    { name: 'Unsubscribed', value: unsubscribed, tone: '#a778ff' },
  ]

  const abRows = ['A', 'B'].map((v) => {
    const s = states.filter((row) => row.variant === v)
    const e = engagement.filter((row) => row.variant === v)
    const n = sum(s, 'n')
    const converted = sum(s.filter((row) => row.state === 'converted'), 'n')
    return {
      variant: v,
      enrolled: n,
      converted,
      conversionRate: n ? (converted / n) * 100 : 0,
      completed: sum(s.filter((row) => row.state === 'completed'), 'n'),
      sent: sum(e, 'sent'),
    }
  })

  const currentStepMap = useMemo(() => {
    const map = new Map()
    for (const row of currentByStep) map.set(row.step_id, (map.get(row.step_id) || 0) + Number(row.n || 0))
    return map
  }, [currentByStep])

  const selectedSequence = region === 'CNJP' ? sequences.CNJP || [] : sequences.ROW || []
  const journeySteps = selectedSequence.map((step, index) => ({
    step,
    index: index + 1,
    active: currentStepMap.get(step) || 0,
  }))

  const trend = (data.trend || []).map((row) => ({
    ...row,
    enrolled: Number(row.enrolled || 0),
    converted: Number(row.converted || 0),
    completed: Number(row.completed || 0),
  }))

  const regionPerformance = ['ROW', 'CNJP'].map((reg) => {
    const rows = (data.states || []).filter((row) => row.funnel_region === reg)
    const total = sum(rows, 'n')
    const converted = sum(rows.filter((row) => row.state === 'converted'), 'n')
    return { region: reg, total, converted, rate: total ? (converted / total) * 100 : 0 }
  })

  const conversionByStep = useMemo(() => {
    const map = new Map()
    for (const row of convertedByStep) {
      const key = row.step_id
      map.set(key, (map.get(key) || 0) + Number(row.n || 0))
    }
    return [...map.entries()].map(([step, value]) => ({ step: shortStep(step), value }))
  }, [convertedByStep])

  const recent = (data.recentEnrollments || []).filter((row) => {
    if (region !== 'All' && row.funnel_region !== region) return false
    if (app !== 'All' && row.os_app !== app) return false
    if (variant !== 'All' && row.variant !== variant) return false
    return true
  })

  const legacySteps = engagement.filter((row) => {
    const sequence = sequences[row.funnel_region] || []
    return !sequence.includes(row.step_id)
  })

  if (loading) {
    return <div className={styles.loading}>Loading live RegFunnelOps data…</div>
  }

  if (error) {
    return <div className={styles.errorBox}>RegFunnelOps could not load: {error}</div>
  }

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
          <a className={styles.navActive} href="#overview">⌂ <span>Overview</span></a>
          <a href="#enrollments">▣ <span>Enrollments</span></a>
          <a href="#journey">⇄ <span>Journey</span></a>
          <a href="#ab">⚗ <span>A/B Tests</span></a>
          <a href="#send-health">✉ <span>Sends & Errors</span></a>
          <a href="#regions">◎ <span>Regions</span></a>
          <a href="#settings">⚙ <span>Settings</span></a>
        </nav>

        <div className={styles.sidebarQuote}>
          <strong>Smarter journeys.<br />Higher impact.</strong>
          <span>Monitor. Learn. Convert.</span>
        </div>
      </aside>

      <main className={styles.main} id="overview">
        <div className={styles.topbar}>
          <div className={styles.search}>⌕ <span>Search enrollments, external IDs or steps…</span></div>
          <div className={styles.topFilters}>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {RANGES.map((value) => <option key={value} value={value}>Last {value} days</option>)}
            </select>
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
            {onBack && <button className={styles.backBtn} onClick={onBack}>Back</button>}
          </div>
        </div>

        <header className={styles.hero}>
          <div>
            <h1>RegFunnelOps</h1>
            <p>Registration funnel operations to turn interest into impact.</p>
          </div>
          <span>LESS FRICTION. MORE PEOPLE FORWARD.</span>
        </header>

        <section className={styles.kpiGrid}>
          <Kpi label="Enrolled" value={enrolled} note={`Cohort: last ${days} days`} tone="cyan" icon="◉" />
          <Kpi label="In Progress" value={stateCounts.in_progress} note={pct(stateCounts.in_progress, enrolled)} tone="blue" icon="▶" />
          <Kpi label="Converted" value={stateCounts.converted} note={`${pct(stateCounts.converted, enrolled)} conversion`} tone="green" icon="▥" />
          <Kpi label="Completed" value={stateCounts.completed} note={pct(stateCounts.completed, enrolled)} tone="teal" icon="✓" />
          <Kpi label="Excluded" value={stateCounts.excluded} note={pct(stateCounts.excluded, enrolled)} tone="red" icon="⊘" />
        </section>

        <section className={styles.topGrid}>
          <Panel
            title="Funnel Journey"
            sub={region === 'All' ? 'ROW sequence shown. Use region filter to inspect CN / JP.' : `${region === 'CNJP' ? 'CN / JP' : 'ROW'} sequence`}
            className={styles.journeyPanel}
            action={<span>{journeySteps.length} steps</span>}
          >
            <div className={styles.journeySteps} id="journey">
              {journeySteps.slice(0, 8).map((item) => (
                <div className={styles.journeyStep} key={item.step}>
                  <span className={styles.stepIndex}>{item.index}</span>
                  <strong>{shortStep(item.step)}</strong>
                  <small>{item.active ? `${item.active} active` : 'No active users'}</small>
                </div>
              ))}
            </div>
            <div className={styles.miniChart}>
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={trend.slice(-24)}>
                  <Bar dataKey="enrolled" fill="#16d9d3" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Send Health" sub="Delivery and send outcomes" className={styles.sendPanel}>
            <div className={styles.sendHealth} id="send-health">
              <div className={styles.donut}>
                <ResponsiveContainer width="100%" height={185}>
                  <PieChart>
                    <Pie data={sendHealth} dataKey="value" innerRadius={55} outerRadius={76} paddingAngle={2}>
                      {sendHealth.map((item) => <Cell key={item.name} fill={item.tone} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className={styles.donutCenter}><strong>{fmt(sent + noRecipient + sendErrors)}</strong><span>Total attempts</span></div>
              </div>
              <div className={styles.legend}>
                {sendHealth.map((item) => (
                  <div key={item.name}><i style={{ background: item.tone }} /><span>{item.name}</span><strong>{fmt(item.value)}</strong></div>
                ))}
              </div>
            </div>
            <div className={`${styles.healthNote} ${sendErrors > 0 ? styles.healthWarn : ''}`}>
              {sendErrors > 0 ? `${sendErrors} send error(s) need review.` : 'Send health is stable.'}
            </div>
          </Panel>

          <Panel title="A/B Test Performance" sub="Sequence-level conversion" className={styles.abPanel} action={<span id="ab">Conversion Rate</span>}>
            <div className={styles.abList}>
              {abRows.map((row) => (
                <div className={styles.abRow} key={row.variant}>
                  <div className={styles.variantBadge}>{row.variant}</div>
                  <div className={styles.abBody}>
                    <div><strong>Variant {row.variant}</strong><span>{fmt(row.converted)} / {fmt(row.enrolled)}</span></div>
                    <div className={styles.progress}><i style={{ width: `${Math.min(100, row.conversionRate)}%` }} /></div>
                  </div>
                  <strong>{row.conversionRate.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className={styles.midGrid}>
          <Panel title="Performance Over Time" sub="Enrollment cohort trend" className={styles.performancePanel}>
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={trend}>
                <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#758da6', fontSize: 10 }} minTickGap={26} />
                <YAxis tick={{ fill: '#758da6', fontSize: 10 }} width={36} />
                <Tooltip contentStyle={{ background: '#0b2035', border: '1px solid #1c3b56', borderRadius: 10 }} />
                <Line dataKey="enrolled" stroke="#25c9ff" strokeWidth={2.2} dot={false} />
                <Line dataKey="converted" stroke="#31e6b5" strokeWidth={2.2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Top Insights" sub="Operational signals" className={styles.insightsPanel}>
            <div className={styles.insights}>
              <div><i className={styles.good}>↗</i><span><strong>Conversion rate</strong><small>{pct(stateCounts.converted, enrolled)} of the selected cohort has converted.</small></span></div>
              <div><i className={sendErrors ? styles.bad : styles.good}>!</i><span><strong>Send errors</strong><small>{sendErrors ? `${sendErrors} error(s) recorded in SendLog.` : 'No send errors in this cohort.'}</small></span></div>
              <div><i className={legacySteps.length ? styles.bad : styles.info}>i</i><span><strong>Sequence integrity</strong><small>{legacySteps.length ? `${legacySteps.length} legacy step row(s) detected.` : 'All engagement rows match the live sequences.'}</small></span></div>
            </div>
          </Panel>

          <Panel title="Regional Performance" sub="Conversion rate by funnel region" className={styles.regionPanel}>
            <div className={styles.regionList} id="regions">
              {regionPerformance.map((row) => (
                <div key={row.region}>
                  <span>{row.region === 'CNJP' ? 'CN / JP' : row.region}</span>
                  <div className={styles.regionBar}><i style={{ width: `${Math.min(100, row.rate)}%` }} /></div>
                  <strong>{row.rate.toFixed(1)}%</strong>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        {conversionByStep.length > 0 && (
          <Panel title="Conversions by Step" sub="Last email sent before conversion">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={conversionByStep} layout="vertical">
                <CartesianGrid stroke="rgba(255,255,255,.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#758da6', fontSize: 10 }} />
                <YAxis type="category" dataKey="step" width={150} tick={{ fill: '#9bb0c3', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#0b2035', border: '1px solid #1c3b56', borderRadius: 10 }} />
                <Bar dataKey="value" fill="#31e6b5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        <Panel
          title="Recent Enrollments"
          sub="Live enrollment state and next scheduled action"
          className={styles.enrollmentPanel}
          action={<span>{recent.length} shown</span>}
        >
          <div className={styles.tableWrap} id="enrollments">
            <table>
              <thead>
                <tr>
                  <th>External ID</th>
                  <th>Country</th>
                  <th>Culture</th>
                  <th>Region</th>
                  <th>App</th>
                  <th>Variant</th>
                  <th>State</th>
                  <th>Current Step</th>
                  <th>Next Send</th>
                  <th>Enrolled At</th>
                </tr>
              </thead>
              <tbody>
                {!recent.length && <tr><td colSpan={10} className={styles.empty}>No enrollments in this cohort.</td></tr>}
                {recent.map((row) => (
                  <tr key={row.external_id}>
                    <td><strong>{row.external_id}</strong></td>
                    <td>{row.country || '—'}</td>
                    <td>{row.culture || '—'}</td>
                    <td>{row.funnel_region === 'CNJP' ? 'CN / JP' : row.funnel_region}</td>
                    <td>{APP_LABELS[row.os_app] || row.os_app}</td>
                    <td><b className={styles.variantText}>{row.variant}</b></td>
                    <td><StatusPill state={row.state} /></td>
                    <td title={row.current_step}>{shortStep(row.current_step)}</td>
                    <td className={row.next_send_at && new Date(row.next_send_at) < new Date() ? styles.overdue : ''}>{relativeDue(row.next_send_at)}</td>
                    <td>{dateTime(row.enrolled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <footer className={styles.footer}>
          Live RegFunnelOps data · cohort basis: {data.cohortBasis || 'enrolledAt'} · generated {dateTime(data.generatedAt)}
        </footer>
      </main>
    </div>
  )
}
