'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './RegFunnelDashboard.module.css'

const API = '/api/regfunnel/stats'
const RANGES = [30, 90, 180, 365, 1000, 3650]
const STATES = ['in_progress', 'converted', 'completed', 'excluded']

const fmt = (value) => Number(value || 0).toLocaleString()
const pct = (a, b, digits = 1) => (b > 0 ? `${((Number(a || 0) / Number(b)) * 100).toFixed(digits)}%` : '—')
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0)

const labelState = (state) =>
  ({
    in_progress: 'In progress',
    converted: 'Converted',
    completed: 'Completed',
    excluded: 'Excluded',
  })[state] || state || 'Unknown'

const labelRegion = (region) => (region === 'CNJP' ? 'CN / JP' : region || 'Unknown')
const labelApp = (app) => (app === 'china' ? 'China' : app === 'global' ? 'Global' : app || 'Unknown')
const labelStep = (step) =>
  step === '00_no_email_yet'
    ? 'Before 1st email'
    : String(step || 'Unknown')
        .replace(/^\d+_/, '')
        .replace(/_/g, ' ')

function matches(row, filters) {
  return (
    (filters.region === 'All' || row.funnel_region === filters.region) &&
    (filters.app === 'All' || row.os_app === filters.app) &&
    (filters.variant === 'All' || row.variant === filters.variant)
  )
}

function rollupSteps(rows, rank) {
  const map = new Map()
  for (const row of rows) {
    const key = row.step_id || '00_no_email_yet'
    const item = map.get(key) || { step: key, A: 0, B: 0, total: 0 }
    const value = Number(row.n || 0)
    if (row.variant === 'B') item.B += value
    else item.A += value
    item.total += value
    map.set(key, item)
  }
  return [...map.values()].sort((a, b) => rank(a.step) - rank(b.step) || a.step.localeCompare(b.step))
}

function Metric({ label, value, detail, tone = 'blue' }) {
  return (
    <div className={`${styles.metric} ${styles[`metric_${tone}`]}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function Pill({ children, tone = 'neutral' }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>{children}</span>
}

function StepBars({ rows, emptyText, max }) {
  if (!rows.length) return <div className={styles.empty}>{emptyText}</div>
  return (
    <div className={styles.stepList}>
      {rows.map((row) => (
        <div className={styles.stepRow} key={row.step}>
          <div className={styles.stepTop}>
            <div>
              <strong>{labelStep(row.step)}</strong>
              <code>{row.step}</code>
            </div>
            <div className={styles.stepCount}>
              <b>{fmt(row.total)}</b>
              <span>
                A {fmt(row.A)} · B {fmt(row.B)}
              </span>
            </div>
          </div>
          <div className={styles.track}>
            <span style={{ width: `${Math.max(2, (row.total / Math.max(1, max)) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RegFunnelDashboard() {
  const [days, setDays] = useState(1000)
  const [region, setRegion] = useState('All')
  const [app, setApp] = useState('All')
  const [variant, setVariant] = useState('All')
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`${API}?days=${days}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body?.error || `Request failed (${response.status})`)
        }
        return body
      })
      .then((body) => {
        if (!cancelled) setStats(body || {})
      })
      .catch((err) => {
        if (!cancelled) {
          setStats(null)
          setError(err?.message || 'Could not load RegFunnelOps data.')
        }
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

  const order = useMemo(() => {
    const seen = new Set(['00_no_email_yet'])
    const out = ['00_no_email_yet']
    for (const step of [...(sequences.ROW || []), ...(sequences.CNJP || [])]) {
      if (!seen.has(step)) {
        seen.add(step)
        out.push(step)
      }
    }
    return out
  }, [sequences.ROW, sequences.CNJP])

  const rank = (step) => {
    const index = order.indexOf(step)
    return index === -1 ? 9999 : index
  }

  const filters = { region, app, variant }
  const states = (data.states || []).filter((row) => matches(row, filters))
  const convertedByStep = (data.convertedByStep || []).filter((row) => matches(row, filters))
  const currentByStep = (data.currentByStep || []).filter((row) => matches(row, filters))
  const engagement = (data.engagement || []).filter((row) => matches(row, filters))

  const enrolled = sum(states, 'n')
  const stateCount = Object.fromEntries(
    STATES.map((state) => [state, sum(states.filter((row) => row.state === state), 'n')]),
  )
  const sent = sum(engagement, 'sent')
  const delivered = sum(engagement, 'delivered')
  const errors = sum(engagement, 'errors')
  const noRecipient = sum(engagement, 'no_recipient')

  const convertedSteps = rollupSteps(convertedByStep, rank)
  const currentSteps = rollupSteps(currentByStep, rank)
  const convertedMax = Math.max(1, ...convertedSteps.map((row) => row.total))
  const currentMax = Math.max(1, ...currentSteps.map((row) => row.total))

  const legacyRows = engagement.filter((row) => {
    const sequence = sequences[row.funnel_region] || []
    return row.step_id !== '00_no_email_yet' && !sequence.includes(row.step_id)
  })

  const invalidRouting = [
    ...states.filter((row) => row.funnel_region === 'ROW' && row.os_app !== 'global'),
    ...engagement.filter((row) => row.funnel_region === 'ROW' && row.os_app !== 'global'),
  ]

  const engagementRows = [...engagement].sort(
    (a, b) =>
      String(a.funnel_region || '').localeCompare(String(b.funnel_region || '')) ||
      rank(a.step_id) - rank(b.step_id) ||
      String(a.os_app || '').localeCompare(String(b.os_app || '')) ||
      String(a.variant || '').localeCompare(String(b.variant || '')),
  )

  const regionsToShow = region === 'All' ? ['ROW', 'CNJP'] : [region]
  const abRows = regionsToShow.flatMap((reg) =>
    ['A', 'B'].map((v) => {
      const stateRows = (data.states || []).filter(
        (row) =>
          row.funnel_region === reg &&
          row.variant === v &&
          (app === 'All' || row.os_app === app),
      )
      const sendRows = (data.engagement || []).filter(
        (row) =>
          row.funnel_region === reg &&
          row.variant === v &&
          (app === 'All' || row.os_app === app),
      )
      const n = sum(stateRows, 'n')
      const converted = sum(stateRows.filter((row) => row.state === 'converted'), 'n')
      const completed = sum(stateRows.filter((row) => row.state === 'completed'), 'n')
      const excluded = sum(stateRows.filter((row) => row.state === 'excluded'), 'n')
      const sends = sum(sendRows, 'sent')
      const deliveredCount = sum(sendRows, 'delivered')
      return {
        region: reg,
        variant: v,
        n,
        converted,
        completed,
        excluded,
        sent: sends,
        delivered: deliveredCount,
        opens: sum(sendRows, 'opened'),
        clicks: sum(sendRows, 'clicked'),
        errors: sum(sendRows, 'errors'),
      }
    }),
  )

  const appRows = ['global', 'china']
    .filter((name) => app === 'All' || app === name)
    .map((name) => {
      const stateRows = (data.states || []).filter(
        (row) => row.os_app === name && (region === 'All' || row.funnel_region === region),
      )
      const sendRows = (data.engagement || []).filter(
        (row) => row.os_app === name && (region === 'All' || row.funnel_region === region),
      )
      return {
        app: name,
        enrolled: sum(stateRows, 'n'),
        inProgress: sum(stateRows.filter((row) => row.state === 'in_progress'), 'n'),
        converted: sum(stateRows.filter((row) => row.state === 'converted'), 'n'),
        completed: sum(stateRows.filter((row) => row.state === 'completed'), 'n'),
        excluded: sum(stateRows.filter((row) => row.state === 'excluded'), 'n'),
        sent: sum(sendRows, 'sent'),
        delivered: sum(sendRows, 'delivered'),
        errors: sum(sendRows, 'errors'),
        noRecipient: sum(sendRows, 'no_recipient'),
      }
    })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>REGFUNNELOPS · LIVE DATA</div>
          <h1>Registration Funnel Dashboard</h1>
          <p>
            Funnel state, A/B performance and send health from FunnelEnrollment, SendLog and Events.
          </p>
        </div>
        <a className={styles.back} href="/?app=analytics&tab=Journeys">
          Back to Analytics
        </a>
      </header>

      <section className={styles.toolbar}>
        <label>
          <span>Enrollment cohort</span>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {RANGES.map((value) => (
              <option key={value} value={value}>
                Last {value} days
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Region</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="All">All regions</option>
            <option value="ROW">ROW</option>
            <option value="CNJP">CN / JP</option>
          </select>
        </label>
        <label>
          <span>OneSignal app</span>
          <select value={app} onChange={(event) => setApp(event.target.value)}>
            <option value="All">All apps</option>
            <option value="global">Global</option>
            <option value="china">China</option>
          </select>
        </label>
        <label>
          <span>Variant</span>
          <select value={variant} onChange={(event) => setVariant(event.target.value)}>
            <option value="All">A + B</option>
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        </label>
        <div className={styles.generated}>
          <span>Cohort basis</span>
          <strong>{data.cohortBasis || '—'}</strong>
          <small>{data.generatedAt ? new Date(data.generatedAt).toLocaleString() : ''}</small>
        </div>
      </section>

      {loading && <div className={styles.notice}>Loading live funnel data…</div>}
      {!loading && error && (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>Could not load dashboard.</strong>
          <span>{error}. If this is 401, sign in on the main app first.</span>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className={styles.metrics}>
            <Metric label="Enrolled" value={fmt(enrolled)} detail={`Last ${days} days`} tone="blue" />
            <Metric
              label="In progress"
              value={fmt(stateCount.in_progress)}
              detail={pct(stateCount.in_progress, enrolled)}
              tone="amber"
            />
            <Metric
              label="Converted"
              value={fmt(stateCount.converted)}
              detail={`${pct(stateCount.converted, enrolled)} conversion`}
              tone="green"
            />
            <Metric
              label="Completed"
              value={fmt(stateCount.completed)}
              detail={pct(stateCount.completed, enrolled)}
              tone="purple"
            />
            <Metric
              label="Excluded"
              value={fmt(stateCount.excluded)}
              detail={pct(stateCount.excluded, enrolled)}
              tone="red"
            />
          </section>

          <section className={styles.metricsSecondary}>
            <Metric label="Sent" value={fmt(sent)} detail={`${pct(delivered, sent)} delivered`} tone="blue" />
            <Metric label="No recipient" value={fmt(noRecipient)} detail="OneSignal alias missing" tone="amber" />
            <Metric label="Send errors" value={fmt(errors)} detail="SendLog result = error" tone="red" />
            <Metric
              label="Data integrity"
              value={legacyRows.length + invalidRouting.length ? 'Review' : 'Clean'}
              detail={`${legacyRows.length} legacy step rows · ${invalidRouting.length} routing issues`}
              tone={legacyRows.length + invalidRouting.length ? 'amber' : 'green'}
            />
          </section>

          {(legacyRows.length > 0 || invalidRouting.length > 0) && (
            <div className={`${styles.notice} ${styles.noticeWarning}`}>
              <strong>Data integrity warning</strong>
              <span>
                {legacyRows.length > 0
                  ? `${legacyRows.length} engagement row(s) use a step outside the current region sequence. `
                  : ''}
                {invalidRouting.length > 0
                  ? `${invalidRouting.length} ROW row(s) are not routed through the Global app.`
                  : ''}
              </span>
            </div>
          )}

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Funnel state</h2>
                <p>Current state of users inside the selected enrollment cohort.</p>
              </div>
              <Pill tone="blue">{fmt(enrolled)} total</Pill>
            </div>
            <div className={styles.stateGrid}>
              {STATES.map((state) => (
                <div className={styles.stateItem} key={state}>
                  <span>{labelState(state)}</span>
                  <strong>{fmt(stateCount[state])}</strong>
                  <small>{pct(stateCount[state], enrolled)}</small>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>A/B by region</h2>
                <p>Sequence-level conversion. Engagement uses the same enrollment cohort.</p>
              </div>
              <Pill>{app === 'All' ? 'All apps' : `${labelApp(app)} app`}</Pill>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Variant</th>
                    <th>Enrolled</th>
                    <th>Converted</th>
                    <th>Conv. rate</th>
                    <th>Completed</th>
                    <th>Excluded</th>
                    <th>Sent</th>
                    <th>Delivery</th>
                    <th>Open</th>
                    <th>Click</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {abRows.map((row) => (
                    <tr key={`${row.region}-${row.variant}`}>
                      <td>{labelRegion(row.region)}</td>
                      <td><strong>{row.variant}</strong></td>
                      <td>{fmt(row.n)}</td>
                      <td>{fmt(row.converted)}</td>
                      <td><strong>{pct(row.converted, row.n, 2)}</strong></td>
                      <td>{fmt(row.completed)}</td>
                      <td>{fmt(row.excluded)}</td>
                      <td>{fmt(row.sent)}</td>
                      <td>{pct(row.delivered, row.sent)}</td>
                      <td>{pct(row.opens, row.delivered)}</td>
                      <td>{pct(row.clicks, row.delivered)}</td>
                      <td>{fmt(row.errors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Global vs China app</h2>
                <p>Separate send-channel health so China issues do not disappear inside CN / JP totals.</p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Enrolled</th>
                    <th>In progress</th>
                    <th>Converted</th>
                    <th>Completed</th>
                    <th>Excluded</th>
                    <th>Sent</th>
                    <th>Delivered</th>
                    <th>No recipient</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {appRows.map((row) => (
                    <tr key={row.app}>
                      <td><strong>{labelApp(row.app)}</strong></td>
                      <td>{fmt(row.enrolled)}</td>
                      <td>{fmt(row.inProgress)}</td>
                      <td>{fmt(row.converted)}</td>
                      <td>{fmt(row.completed)}</td>
                      <td>{fmt(row.excluded)}</td>
                      <td>{fmt(row.sent)}</td>
                      <td>{fmt(row.delivered)} <small>({pct(row.delivered, row.sent)})</small></td>
                      <td>{fmt(row.noRecipient)}</td>
                      <td>{fmt(row.errors)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.twoCol}>
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Conversion by step</h2>
                  <p>Last email actually sent before conversion.</p>
                </div>
              </div>
              <StepBars rows={convertedSteps} max={convertedMax} emptyText="No conversions in this cohort." />
            </div>
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Where active users are</h2>
                  <p>Current step of users still in progress.</p>
                </div>
              </div>
              <StepBars rows={currentSteps} max={currentMax} emptyText="No users are currently in progress." />
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2>Engagement by step</h2>
                <p>SendLog plus Events, sorted by the live sequence from Funnel Config.</p>
              </div>
              <Pill tone={legacyRows.length ? 'amber' : 'green'}>
                {legacyRows.length ? `${legacyRows.length} legacy` : 'Sequence clean'}
              </Pill>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Region</th>
                    <th>App</th>
                    <th>Var.</th>
                    <th>Sent</th>
                    <th>No recipient</th>
                    <th>Errors</th>
                    <th>Delivered</th>
                    <th>Open</th>
                    <th>Click</th>
                    <th>Unsub</th>
                    <th>Bounced</th>
                  </tr>
                </thead>
                <tbody>
                  {!engagementRows.length && (
                    <tr>
                      <td colSpan={12} className={styles.emptyCell}>No send activity in this cohort.</td>
                    </tr>
                  )}
                  {engagementRows.map((row) => {
                    const sequence = sequences[row.funnel_region] || []
                    const legacy = row.step_id !== '00_no_email_yet' && !sequence.includes(row.step_id)
                    return (
                      <tr key={`${row.funnel_region}-${row.os_app}-${row.variant}-${row.step_id}`}>
                        <td>
                          <div className={styles.stepCell}>
                            <strong>{labelStep(row.step_id)}</strong>
                            <code>{row.step_id}</code>
                            {legacy && <Pill tone="amber">legacy</Pill>}
                          </div>
                        </td>
                        <td>{labelRegion(row.funnel_region)}</td>
                        <td>{labelApp(row.os_app)}</td>
                        <td><strong>{row.variant}</strong></td>
                        <td>{fmt(row.sent)}</td>
                        <td>{fmt(row.no_recipient)}</td>
                        <td>{fmt(row.errors)}</td>
                        <td>{fmt(row.delivered)} <small>({pct(row.delivered, row.sent)})</small></td>
                        <td>{pct(row.opened, row.delivered)}</td>
                        <td>{pct(row.clicked, row.delivered)}</td>
                        <td>{pct(row.unsubscribed, row.delivered, 2)}</td>
                        <td>{fmt(row.bounced)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <footer className={styles.footer}>
            Live RegFunnelOps data · no mock funnel metrics on this page.
          </footer>
        </>
      )}
    </div>
  )
}
