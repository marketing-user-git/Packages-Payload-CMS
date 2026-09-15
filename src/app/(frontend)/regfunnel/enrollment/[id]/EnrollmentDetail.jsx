'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from './EnrollmentDetail.module.css'

const THEME_KEY = 'em-internal-theme'
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

const initialTheme = () => {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const dateTime = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const shortStep = (value) =>
  !value || value === '00_no_email_yet'
    ? 'Before first email'
    : String(value).replace(/^\d+_/, '').replaceAll('_', ' ')

const titleCase = (value) =>
  String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())

function CountryFlag({ country }) {
  const code = COUNTRY_CODE[country]
  if (!code) return <span className={styles.flagFallback}>{String(country || '—').slice(0, 2).toUpperCase()}</span>
  return <img className={styles.flag} src={`https://flagcdn.com/w40/${code}.png`} alt="" />
}

function StatePill({ state }) {
  return <span className={`${styles.statePill} ${styles[`state_${state}`] || ''}`}>{titleCase(state)}</span>
}

function Metric({ label, value, tone = 'default' }) {
  return (
    <div className={`${styles.metric} ${styles[`metric_${tone}`] || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

const EVENT_META = {
  delivered: { label: 'Delivered', icon: '✓', tone: 'green' },
  opened: { label: 'Opened', icon: '◉', tone: 'blue' },
  clicked: { label: 'Link clicked', icon: '↗', tone: 'cyan' },
  unsubscribed: { label: 'Unsubscribed', icon: '−', tone: 'amber' },
  bounced_hard: { label: 'Bounced', icon: '!', tone: 'red' },
  bounced_soft: { label: 'Soft bounce', icon: '!', tone: 'amber' },
  complained: { label: 'Reported as spam', icon: '!', tone: 'red' },
  failed: { label: 'Delivery failed', icon: '×', tone: 'red' },
  accepted: { label: 'Accepted by provider', icon: '✓', tone: 'blue' },
}

export default function EnrollmentDetail({ enrollmentId }) {
  const [theme, setTheme] = useState(initialTheme)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    fetch(`/api/regfunnel/enrollments/${encodeURIComponent(enrollmentId)}`, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body?.error || `Request failed (${response.status})`)
        return body
      })
      .then((body) => { if (!cancelled) setData(body) })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Could not load this enrollment.') })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [enrollmentId])

  const timeline = useMemo(() => {
    if (!data) return []
    const stepByNotification = new Map(
      (data.sends || [])
        .filter((send) => send.notificationId)
        .map((send) => [send.notificationId, send.stepId]),
    )

    const sends = (data.sends || []).map((send) => ({
      id: `send-${send.id}`,
      timestamp: send.attemptedAt,
      kind: 'send',
      result: send.result,
      title: send.result === 'sent' ? 'Email sent' : send.result === 'error' ? 'Send error' : titleCase(send.result),
      detail: shortStep(send.stepId),
      errorDetail: send.errorDetail,
      tone: send.result === 'error' ? 'red' : send.result === 'sent' ? 'green' : 'amber',
      icon: send.result === 'error' ? '!' : send.result === 'sent' ? '→' : '•',
    }))

    const events = (data.events || []).map((event) => {
      const meta = EVENT_META[event.eventType] || { label: titleCase(event.eventType), icon: '•', tone: 'blue' }
      const step = stepByNotification.get(event.notificationId)
      return {
        id: `event-${event.id}`,
        timestamp: event.timestamp,
        kind: 'event',
        title: meta.label,
        detail: step ? shortStep(step) : event.templateKey ? shortStep(event.templateKey) : 'Email event',
        tone: meta.tone,
        icon: meta.icon,
      }
    })

    return [...sends, ...events]
      .filter((item) => item.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [data])

  if (loading) {
    return <div className={styles.fullState} data-theme={theme}>Loading enrollment…</div>
  }

  if (error || !data?.enrollment) {
    return (
      <div className={styles.fullState} data-theme={theme}>
        <div>
          <strong>Could not open this enrollment</strong>
          <span>{error || 'Enrollment not found.'}</span>
          <a href="/regfunnel#enrollments">Back to RegFunnelOps</a>
        </div>
      </div>
    )
  }

  const enrollment = data.enrollment
  const engagement = data.engagement || {}
  const sentCount = (data.sends || []).filter((send) => send.result === 'sent').length

  return (
    <div className={styles.shell} data-theme={theme}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarFrame} aria-hidden="true" />
        <div className={styles.brand}>
          <div className={styles.brandMark}>RF</div>
          <div><strong>RegFunnelOps</strong><small>Marketing Operations</small></div>
        </div>

        <nav className={styles.nav} aria-label="RegFunnelOps navigation">
          <a href="/regfunnel#overview"><span>⌂</span><div><strong>Overview</strong><small>Key metrics & insights</small></div></a>
          <a className={styles.navActive} href="/regfunnel#enrollments"><span>♙</span><div><strong>Enrollments</strong><small>People in your funnel</small></div></a>
          <a href="/regfunnel#journey"><span>⇄</span><div><strong>Journey</strong><small>Funnel stages & email steps</small></div></a>
          <a href="/regfunnel#ab"><span>◫</span><div><strong>Variants</strong><small>Sequence performance</small></div></a>
          <a href="/regfunnel#send-health"><span>✉</span><div><strong>Sends & Errors</strong><small>Delivery and issues</small></div></a>
        </nav>

        <div className={styles.powered}><small>Powered by</small><span /></div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <a className={styles.back} href="/regfunnel#enrollments">← Back to enrollments</a>
          <button
            type="button"
            className={styles.themeButton}
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀' : '◐'}
          </button>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroIdentity}>
            <CountryFlag country={enrollment.country} />
            <div>
              <span>Enrollment</span>
              <h1>{enrollment.externalId}</h1>
              <p>{enrollment.country || 'Unknown country'} · {enrollment.culture || 'No culture'} · {enrollment.osApp === 'china' ? 'China app' : 'Global app'}</p>
            </div>
          </div>
          <StatePill state={enrollment.state} />
        </section>

        <section className={styles.metrics}>
          <Metric label="State" value={titleCase(enrollment.state)} tone={enrollment.state === 'converted' || enrollment.state === 'completed' ? 'green' : 'cyan'} />
          <Metric label="Variant" value={`Variant ${enrollment.variant || '—'}`} />
          <Metric label="Region" value={enrollment.funnelRegion === 'CNJP' ? 'CN / JP' : enrollment.funnelRegion || '—'} />
          <Metric label="Emails sent" value={sentCount} tone="cyan" />
          <Metric label="Delivered" value={engagement.delivered || 0} tone="green" />
        </section>

        <section className={styles.contentGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHead}><div><h2>Journey status</h2><p>Where this user is in the registration funnel</p></div></div>
            <div className={styles.detailGrid}>
              <div><span>Current step</span><strong>{titleCase(shortStep(enrollment.currentStep))}</strong></div>
              <div><span>Last email sent</span><strong>{titleCase(shortStep(enrollment.lastSentStep))}</strong></div>
              <div><span>Next send</span><strong>{dateTime(enrollment.nextSendAt)}</strong></div>
              <div><span>Sequence position</span><strong>{Number(enrollment.sendIndex || 0) + 1}</strong></div>
              <div><span>Enrolled</span><strong>{dateTime(enrollment.enrolledAt)}</strong></div>
              <div><span>Last updated</span><strong>{dateTime(enrollment.updatedAt)}</strong></div>
              {enrollment.convertedAt && <div><span>Converted</span><strong>{dateTime(enrollment.convertedAt)}</strong></div>}
              {enrollment.convertedAtStep && <div><span>Converted after</span><strong>{titleCase(shortStep(enrollment.convertedAtStep))}</strong></div>}
              {enrollment.completedAt && <div><span>Completed</span><strong>{dateTime(enrollment.completedAt)}</strong></div>}
            </div>
            <div className={styles.statusFlags}>
              <span className={enrollment.paused ? styles.flagWarn : styles.flagOk}>{enrollment.paused ? 'Paused' : 'Not paused'}</span>
              <span className={enrollment.excluded ? styles.flagWarn : styles.flagOk}>{enrollment.excluded ? 'Excluded' : 'Eligible / active record'}</span>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}><div><h2>Email engagement</h2><p>Events captured from OneSignal delivery tracking</p></div></div>
            <div className={styles.engagementGrid}>
              <div><span>Delivered</span><strong>{engagement.delivered || 0}</strong></div>
              <div><span>Opened</span><strong>{engagement.opened || 0}</strong></div>
              <div><span>Clicked</span><strong>{engagement.clicked || 0}</strong></div>
              <div><span>Unsubscribed</span><strong>{engagement.unsubscribed || 0}</strong></div>
              <div><span>Bounced</span><strong>{engagement.bounced || 0}</strong></div>
              <div><span>Failed</span><strong>{engagement.failed || 0}</strong></div>
            </div>
            {!data.events?.length && (
              <div className={styles.infoNote}>No delivery events have been captured for this enrollment yet.</div>
            )}
          </article>
        </section>

        <article className={`${styles.panel} ${styles.timelinePanel}`}>
          <div className={styles.panelHead}>
            <div><h2>Activity timeline</h2><p>Send attempts and delivery / engagement events in one view</p></div>
            <span className={styles.eventCount}>{timeline.length} events</span>
          </div>

          <div className={styles.timeline}>
            {timeline.length ? timeline.map((item) => (
              <div className={styles.timelineItem} key={item.id}>
                <div className={`${styles.timelineIcon} ${styles[`tone_${item.tone}`] || ''}`}>{item.icon}</div>
                <div className={styles.timelineBody}>
                  <div><strong>{item.title}</strong><time>{dateTime(item.timestamp)}</time></div>
                  <span>{titleCase(item.detail)}</span>
                  {item.errorDetail && <small>{item.errorDetail}</small>}
                </div>
              </div>
            )) : (
              <div className={styles.emptyTimeline}>No send or engagement activity has been recorded yet.</div>
            )}
          </div>
        </article>
      </main>
    </div>
  )
}
