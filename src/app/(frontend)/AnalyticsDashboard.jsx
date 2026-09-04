'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { LOGO_B64 } from './Dashboard'
import { exportDailyRows, exportGroups, exportSummary } from '@/lib/analytics/exportReport'
import { readParam, writeParams, onPopState } from '@/lib/urlState'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'

const C = {
  green: '#84c561',
  greenDark: '#6aad49',
  blue: '#22a8ff',
  blueLight: 'var(--an-blue-soft)',
  dark: 'var(--an-text)',
  bg: 'var(--an-bg)',
  white: 'var(--an-panel)',
  border: 'var(--an-border)',
  mid: 'var(--an-muted)',
  red: '#ff4d67',
  amber: '#f2a93b',
  purple: '#9b5cff',
  greenTxt: '#37ce63',
}
const API = '/api'
const SOURCE_LABEL = {
  mailgun: 'Email (Mailgun)',
  onesignal_global: 'Push · Global',
  onesignal_china: 'Push · China',
}
const fmt = (n) => (n ?? 0).toLocaleString()
const pctStr = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(1) + '%' : '—')
const pctNum = (a, b) => (b > 0 ? (a / b) * 100 : 0)
const rateColor = (v) => (v >= 65 ? C.greenTxt : v >= 45 ? C.amber : C.red)
// Derive a broad THEME from a template name (keyword vocab built from real data).
const THEMES = [
  [
    'Promotions & Bonuses',
    /promotion|promo|bonus|draw|festival|mooncake|double 1[12]|mystery box|cashback|million|lucky draw|gift/i,
  ],
  ['Funnels', /funnel|registration/i],
  ['TradingView', /tradingview|tv integration/i],
  ['Webinars & Education', /webinar|zoom|institute|academy|masterclass|seminar/i],
  ['Account & Products', /account packages|account types|mt5|mt4|leverage|packages|spread/i],
  ['Verification & Ops', /verification|shufti|kyc|domain|systems? down|maintenance/i],
  ['Referral', /\braf\b|refer/i],
  ['Crypto', /crypto/i],
  ['Partnerships', /dealsize|alphapath|zota|wechat|partner/i],
  ['Welcome & Onboarding', /welcome|day 0|onboarding|get started/i],
]
function themeOf(name) {
  const n = name || ''
  for (const [label, re] of THEMES) if (re.test(n)) return label
  return 'Other'
}
function familyOfName(name) {
  const clean = (name || '')
    .replace(/\u00e1|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const i = clean.indexOf(' - ')
  return (i > 0 ? clean.slice(0, i) : clean).trim() || '\u2014'
}

function normalizeCampaignDocs(docs) {
  return (docs || []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description || '',
    notes: c.notes || '',
    status: c.status || 'active',
    color: c.color || '',
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
    templateIds: (c.templates || [])
      .map((t) => (typeof t === 'object' && t ? t.id : t))
      .filter(Boolean),
    keys: (c.templates || [])
      .map((t) => (typeof t === 'object' && t ? t.templateKey : null))
      .filter(Boolean),
  }))
}

const dayMs = 86400000

const TABS = [
  'Overview',
  'Executive',
  'Campaigns',
  'Templates',
  'Audience',
  'Channels',
  'Timing',
  'Journeys',
  'Deliverability',
  'Data Quality',
  'Alerts',
]
const NAV_GROUPS = [
  { label: 'Overview', items: ['Overview', 'Executive'] },
  { label: 'Campaigns', items: ['Campaigns', 'Templates', 'Timing'] },
  { label: 'Audience', items: ['Audience', 'Channels', 'Journeys'] },
  { label: 'Health', items: ['Deliverability', 'Data Quality', 'Alerts'] },
]
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const ALERT_RULES_KEY = 'em-analytics-alert-rules-v1'
const NOTIFICATION_READ_KEY = 'em-analytics-notification-read-v1'
const DEFAULT_ALERT_RULES = {
  deliveryMin: 96,
  openDropMax: 3,
  ctrDropMax: 1.5,
  complaintMax: 0.1,
  bounceMax: 5,
  unsubscribeMax: 1,
  dataQualityMin: 90,
}

export default function AnalyticsDashboard({
  user,
  onBack,
  onLogout,
  theme = 'dark',
  onToggleTheme,
}) {
  const [rows, setRows] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [templateCatalog, setTemplateCatalog] = useState([])
  const [tplMap, setTplMap] = useState({})
  const [err, setErr] = useState('')
  const [days, setDays] = useState(90)
  const [channel, setChannel] = useState('All')
  const [region, setRegion] = useState('All')
  const [campaign, setCampaign] = useState('All')
  // Mirrored into ?tab= so Back steps through tabs before leaving the app.
  const [tab, setTabState] = useState(() => readParam('tab', TABS) || 'Overview')

  const setTab = useCallback((t) => {
    setTabState(t)
    // Overview is the default, so it stays out of the URL.
    writeParams({ tab: t === 'Overview' ? null : t })
  }, [])

  useEffect(() => onPopState(() => setTabState(readParam('tab', TABS) || 'Overview')), [])
  const [events, setEvents] = useState(null) // lazily loaded, Timing tab only
  const [journeys, setJourneys] = useState(null) // lazily loaded, Journeys tab only
  const [journeyErr, setJourneyErr] = useState('')
  const [savedViews, setSavedViews] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [commandOpen, setCommandOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [kpiDrilldown, setKpiDrilldown] = useState(null)
  const [campaignBuilderSignal, setCampaignBuilderSignal] = useState(0)
  const [templateFocus, setTemplateFocus] = useState('')
  const [notificationRead, setNotificationRead] = useState(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      return new Set(JSON.parse(window.localStorage.getItem(NOTIFICATION_READ_KEY) || '[]'))
    } catch {
      return new Set()
    }
  })

  const refreshCampaigns = useCallback(async () => {
    const response = await fetch(`${API}/campaigns?limit=500&depth=1&sort=name`, {
      credentials: 'include',
    })
    if (!response.ok) throw new Error('Campaign request failed')
    const data = await response.json()
    setCampaigns(normalizeCampaignDocs(data?.docs || []))
  }, [])

  const refreshSavedViews = useCallback(async () => {
    try {
      const response = await fetch(`${API}/analytics-saved-views?limit=200&depth=1&sort=name`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Saved views request failed')
      const data = await response.json()
      setSavedViews(data?.docs || [])
    } catch {
      setSavedViews([])
    }
  }, [])

  const refreshAuditLogs = useCallback(async () => {
    try {
      const response = await fetch(`${API}/analytics-audit-logs?limit=80&depth=0&sort=-createdAt`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Audit request failed')
      const data = await response.json()
      setAuditLogs(data?.docs || [])
    } catch {
      setAuditLogs([])
    }
  }, [])

  useEffect(() => {
    refreshSavedViews()
    refreshAuditLogs()
  }, [refreshSavedViews, refreshAuditLogs])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setNotificationsOpen(false)
        setKpiDrilldown(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [rr, cr, tm] = await Promise.all([
          fetch(`${API}/analytics-daily?limit=10000&depth=0&sort=date`, {
            credentials: 'include',
          }).then((r) => r.json()),
          fetch(`${API}/campaigns?limit=500&depth=1&sort=name`, { credentials: 'include' }).then(
            (r) => r.json(),
          ),
          fetch(`${API}/template-mappings?limit=5000&depth=0&sort=family`, {
            credentials: 'include',
          }).then((r) => r.json()),
        ])
        setRows(rr?.docs || [])
        const mappingDocs = tm?.docs || []
        const map = {}
        for (const t of mappingDocs)
          map[t.templateKey] = { family: t.family || t.templateName, name: t.templateName }
        setTplMap(map)
        setTemplateCatalog(
          mappingDocs.map((t) => ({
            id: t.id,
            key: t.templateKey,
            name: t.templateName,
            family: t.family || familyOfName(t.templateName),
            theme: themeOf(`${t.family || ''} ${t.templateName || ''}`),
          })),
        )
        setCampaigns(normalizeCampaignDocs(cr?.docs || []))
      } catch {
        setErr('Could not load analytics data.')
        setRows([])
      }
    })()
  }, [])

  // Timing needs per-event hours, which the daily rollup doesn't carry — load raw
  // events on demand the first time the tab is opened.
  useEffect(() => {
    if (tab !== 'Timing' || events !== null) return
    const since = new Date(Date.now() - days * dayMs).toISOString()
    fetch(
      `${API}/events?limit=20000&depth=0&sort=timestamp` +
        `&where[timestamp][greater_than]=${since}` +
        `&where[eventType][in]=delivered,opened,clicked`,
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((d) => setEvents(d?.docs || []))
      .catch(() => setEvents([]))
  }, [tab, events, days])

  // A range change invalidates the cached events window.
  useEffect(() => setEvents(null), [days])

  // Journey analytics comes from the existing JourneyTracking collection. Load it only
  // when needed so the general analytics dashboard stays lightweight.
  useEffect(() => {
    if (tab !== 'Journeys' || journeys !== null) return
    setJourneyErr('')
    fetch(`${API}/journey-tracking?limit=10000&depth=0&sort=-journeyStartedAt`, {
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Journey request failed')
        return r.json()
      })
      .then((d) => setJourneys(d?.docs || []))
      .catch(() => {
        setJourneyErr('Could not load journey tracking data.')
        setJourneys([])
      })
  }, [tab, journeys])

  const campaignKeys = useMemo(() => {
    const c = campaigns.find((x) => x.name === campaign)
    return c ? new Set(c.keys) : null
  }, [campaigns, campaign])

  const weekly = days > 92 // group charts by week for long ranges

  const { current, previous, scopeCurrent, scopePrevious } = useMemo(() => {
    if (!rows) return { current: [], previous: [], scopeCurrent: [], scopePrevious: [] }
    const now = Date.now()
    const curStart = now - days * dayMs
    const prevStart = now - 2 * days * dayMs
    const scopePass = (r) =>
      (channel === 'All' || r.channel === channel) && (region === 'All' || r.region === region)
    const campaignPass = (r) => !campaignKeys || campaignKeys.has(r.templateKey)
    const cur = [],
      prev = [],
      scopeCur = [],
      scopePrev = []
    for (const r of rows) {
      if (!scopePass(r)) continue
      const t = new Date(r.date).getTime()
      if (t >= curStart) {
        scopeCur.push(r)
        if (campaignPass(r)) cur.push(r)
      } else if (t >= prevStart) {
        scopePrev.push(r)
        if (campaignPass(r)) prev.push(r)
      }
    }
    return { current: cur, previous: prev, scopeCurrent: scopeCur, scopePrevious: scopePrev }
  }, [rows, days, channel, region, campaignKeys])

  const filteredEvents = useMemo(() => {
    if (events === null) return null
    return events.filter(
      (e) =>
        (channel === 'All' || e.channel === channel) &&
        (region === 'All' || e.region === region) &&
        (!campaignKeys || campaignKeys.has(e.templateKey)),
    )
  }, [events, channel, region, campaignKeys])

  const agg = useMemo(() => sumRows(current), [current])
  const aggPrev = useMemo(() => sumRows(previous), [previous])
  const scopeConfidence = useMemo(() => buildScopeConfidence(current, tplMap), [current, tplMap])
  const anomalies = useMemo(
    () => buildStatisticalAnomalies(current, previous, campaigns, tplMap),
    [current, previous, campaigns, tplMap],
  )
  const notificationItems = useMemo(
    () => buildNotificationFeed(anomalies, current, campaigns, tplMap),
    [anomalies, current, campaigns, tplMap],
  )
  const unreadNotifications = notificationItems.filter(
    (item) => !notificationRead.has(item.id),
  ).length
  const regions = useMemo(
    () => [...new Set((rows || []).map((r) => r.region))].filter(Boolean).sort(),
    [rows],
  )
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time',
    [],
  )

  const applySavedView = useCallback(
    (view) => {
      if (!view) return
      setDays(Number(view.days) || 90)
      setCampaign(view.campaign || 'All')
      setChannel(view.channel || 'All')
      setRegion(view.region || 'All')
      setTab(view.tab && TABS.includes(view.tab) ? view.tab : 'Overview')
    },
    [setTab],
  )

  const markNotificationsRead = useCallback(() => {
    const next = new Set(notificationItems.map((item) => item.id))
    setNotificationRead(next)
    try {
      window.localStorage.setItem(NOTIFICATION_READ_KEY, JSON.stringify([...next]))
    } catch {}
  }, [notificationItems])

  const openNotifications = useCallback(() => {
    setNotificationsOpen(true)
    markNotificationsRead()
    refreshAuditLogs()
  }, [markNotificationsRead, refreshAuditLogs])

  if (rows === null)
    return (
      <Screen>
        <Spinner />
      </Screen>
    )

  const complaintRate = pctNum(agg.complaints, agg.delivered)
  const bounceRate = pctNum(agg.hardBounces + agg.softBounces, agg.sent)

  return (
    <div className="analyticsShell" data-theme={theme}>
      <style>{PRINT_CSS}</style>

      <header className="analyticsTopbar no-print">
        <div className="analyticsBrandGroup">
          <img
            src={`data:image/svg+xml;base64,${LOGO_B64}`}
            alt="easyMarkets"
            className="analyticsLogo"
          />
          <span className="analyticsBrandDivider" />
          <div className="analyticsProductName">Marketing Analytics</div>
          <span className="analyticsScopeBadge">Global · all campaigns</span>
        </div>

        <div className="analyticsTopActions">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="analyticsSearchTrigger"
            aria-label="Search analytics"
            title="Search analytics · Ctrl/Cmd + K"
          >
            <SearchIcon />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={openNotifications}
            className="analyticsIconButton analyticsNotificationButton"
            aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
            title="Notifications & activity"
          >
            <BellIcon />
            {unreadNotifications > 0 && (
              <span className="analyticsNotificationBadge">
                {Math.min(99, unreadNotifications)}
              </span>
            )}
          </button>

          {onBack && (
            <button type="button" onClick={onBack} className="analyticsHeaderButton">
              <GridIcon />
              <span>Apps</span>
            </button>
          )}

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="analyticsIconButton"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          )}

          <div className="analyticsUser">
            <span className="analyticsUserName">{user.name || user.username}</span>
            <span className="analyticsAvatar">
              {(user.name || user.username || 'U').charAt(0).toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="analyticsHeaderButton analyticsSignout"
          >
            <LogoutIcon />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <div className="analyticsBody">
        <aside className="analyticsSidebar no-print">
          <nav className="analyticsNav" aria-label="Analytics sections">
            {NAV_GROUPS.map((group) => (
              <div className="analyticsNavGroup" key={group.label}>
                <div className="analyticsNavGroupLabel">{group.label}</div>
                <div className="analyticsNavGroupItems">
                  {group.items.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => setTab(t)}
                      className={`analyticsNavItem ${tab === t ? 'active' : ''}`}
                      aria-current={tab === t ? 'page' : undefined}
                    >
                      <NavIcon name={t} />
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="analyticsHelpCard">
            <div className="analyticsHelpIcon">?</div>
            <div>
              <strong>Need help?</strong>
              <span>Check our internal documentation</span>
            </div>
            <ArrowRightIcon />
          </div>
        </aside>

        <main className="analyticsMain">
          <PrintHeader meta={{ days, channel, region, campaign }} tab={tab} />

          <div className="analyticsToolbar no-print">
            <div className="analyticsFilters">
              <Filter
                label="Range"
                icon={<CalendarIcon />}
                value={days}
                set={(v) => setDays(Number(v))}
                opts={[
                  [30, 'Last 30 days'],
                  [90, 'Last 3 months'],
                  [180, 'Last 6 months'],
                  [365, 'Last 12 months'],
                ]}
              />
              <Filter
                label="Campaign"
                value={campaign}
                set={setCampaign}
                opts={[['All', 'All campaigns'], ...campaigns.map((c) => [c.name, c.name])]}
              />
              <Filter
                label="Channel"
                value={channel}
                set={setChannel}
                opts={[
                  ['All', 'All channels'],
                  ['email', 'Email'],
                  ['push', 'Push'],
                ]}
              />
              <Filter
                label="Region"
                value={region}
                set={setRegion}
                opts={[['All', 'All regions'], ...regions.map((r) => [r, r])]}
              />
            </div>

            <div className="analyticsToolbarRight">
              <SavedViewsMenu
                views={savedViews}
                user={user}
                current={{ name: '', tab, days, campaign, channel, region }}
                onApply={applySavedView}
                onChanged={async () => {
                  await refreshSavedViews()
                  await refreshAuditLogs()
                }}
              />
              <DataConfidenceBadge confidence={scopeConfidence} />
              <span className="analyticsTimeZone">
                All times displayed in <strong>{timeZone}</strong>
              </span>
              <span className="analyticsRowMeta">
                {current.length} rows · vs previous {days}d{weekly ? ' · weekly' : ''}
              </span>
              <ExportMenu
                rows={current}
                agg={agg}
                aggPrev={aggPrev}
                tplMap={tplMap}
                campaigns={campaigns}
                meta={{ days, channel, region, campaign }}
              />
            </div>
          </div>

          {err && <Banner>{err}</Banner>}

          {!current.length && tab !== 'Journeys' && (
            <div className="analyticsScopeEmptyState no-print">
              <div className="analyticsScopeEmptyIcon">
                <SearchIcon />
              </div>
              <div>
                <strong>No analytics rows match this scope</strong>
                <span>
                  {campaign !== 'All' || channel !== 'All' || region !== 'All'
                    ? 'One or more active filters remove all data. Reset the scope or widen the date range.'
                    : 'The selected period does not contain analytics rollup rows yet.'}
                </span>
              </div>
              <button
                type="button"
                className="analyticsSecondaryButton"
                onClick={() => {
                  setCampaign('All')
                  setChannel('All')
                  setRegion('All')
                  setDays(90)
                }}
              >
                Reset filters
              </button>
            </div>
          )}

          <div className="analyticsContent">
            {tab === 'Overview' && (
              <Overview
                agg={agg}
                aggPrev={aggPrev}
                current={current}
                previous={previous}
                scopeCurrent={scopeCurrent}
                scopePrevious={scopePrevious}
                complaintRate={complaintRate}
                bounceRate={bounceRate}
                weekly={weekly}
                campaigns={campaigns}
                tplMap={tplMap}
                confidence={scopeConfidence}
                anomalies={anomalies}
                onKpiDrilldown={setKpiDrilldown}
              />
            )}
            {tab === 'Executive' && (
              <ExecutiveOverview
                current={current}
                previous={previous}
                scopeCurrent={scopeCurrent}
                scopePrevious={scopePrevious}
                campaigns={campaigns}
                tplMap={tplMap}
                meta={{ days, channel, region, campaign }}
              />
            )}
            {tab === 'Campaigns' && (
              <CampaignsTab
                current={current}
                previous={previous}
                scopeCurrent={scopeCurrent}
                scopePrevious={scopePrevious}
                campaigns={campaigns}
                templateCatalog={templateCatalog}
                openBuilderSignal={campaignBuilderSignal}
                onCampaignCreated={async () => {
                  await refreshCampaigns()
                  await refreshAuditLogs()
                }}
              />
            )}
            {tab === 'Templates' && (
              <TemplatesTab current={current} tplMap={tplMap} focusTemplate={templateFocus} />
            )}
            {tab === 'Audience' && <AudienceIntelligence current={current} previous={previous} />}
            {tab === 'Channels' && <Channels current={current} />}
            {tab === 'Timing' && <TimingTab events={filteredEvents} current={current} />}
            {tab === 'Journeys' && (
              <JourneyAnalytics journeys={journeys} error={journeyErr} days={days} />
            )}
            {tab === 'Deliverability' && (
              <Deliverability
                current={current}
                agg={agg}
                aggPrev={aggPrev}
                complaintRate={complaintRate}
                bounceRate={bounceRate}
                weekly={weekly}
              />
            )}
            {tab === 'Data Quality' && (
              <DataQuality current={current} tplMap={tplMap} campaigns={campaigns} />
            )}
            {tab === 'Alerts' && (
              <AlertCenter
                current={current}
                previous={previous}
                scopeCurrent={scopeCurrent}
                campaigns={campaigns}
                tplMap={tplMap}
              />
            )}
          </div>

          <div className="analyticsFooter no-print">
            Showing mock data · live Mailgun/OneSignal feed connects next.
          </div>
        </main>
      </div>

      {commandOpen && (
        <CommandPalette
          tabs={TABS}
          campaigns={campaigns}
          templates={templateCatalog}
          savedViews={savedViews}
          onClose={() => setCommandOpen(false)}
          onNavigate={(nextTab) => {
            setTab(nextTab)
            setCommandOpen(false)
          }}
          onCampaign={(name) => {
            setCampaign(name)
            setTab('Campaigns')
            setCommandOpen(false)
          }}
          onTemplate={(item) => {
            setTemplateFocus(item?.name || item?.key || '')
            setTab('Templates')
            setCommandOpen(false)
          }}
          onSavedView={(view) => {
            applySavedView(view)
            setCommandOpen(false)
          }}
          onNewCampaign={() => {
            setTab('Campaigns')
            setCampaignBuilderSignal((value) => value + 1)
            setCommandOpen(false)
          }}
        />
      )}

      {notificationsOpen && (
        <NotificationsDrawer
          items={notificationItems}
          auditLogs={auditLogs}
          onClose={() => setNotificationsOpen(false)}
          onNavigate={(nextTab) => {
            setTab(nextTab)
            setNotificationsOpen(false)
          }}
        />
      )}

      {kpiDrilldown && (
        <KpiDrilldownModal
          metric={kpiDrilldown}
          rows={current}
          campaigns={campaigns}
          tplMap={tplMap}
          onClose={() => setKpiDrilldown(null)}
        />
      )}
    </div>
  )
}

function Overview({
  agg,
  aggPrev,
  current,
  previous,
  scopeCurrent,
  scopePrevious,
  complaintRate,
  bounceRate,
  weekly,
  campaigns,
  tplMap,
  confidence,
  anomalies,
  onKpiDrilldown,
}) {
  const openNow = pctNum(agg.uniqueOpens, agg.delivered)
  const openPrev = pctNum(aggPrev.uniqueOpens, aggPrev.delivered)
  const ctrNow = pctNum(agg.uniqueClicks, agg.delivered)
  const ctrPrev = pctNum(aggPrev.uniqueClicks, aggPrev.delivered)
  const trend = buildTrend(current, weekly)
  const kpiTrend = buildKpiTrend(current, weekly)
  const summary = buildSummary(agg, aggPrev, current)
  const insights = buildOverviewIntelligence(agg, aggPrev, current)
  const intelligenceFeed = buildIntelligenceFeed({
    current,
    previous,
    scopeCurrent,
    scopePrevious,
    campaigns,
    tplMap,
  })

  return (
    <>
      {summary && (
        <div className="analyticsSummary">
          <div className="analyticsSummaryIcon">
            <SparkleIcon />
          </div>
          <div className="analyticsSummaryText">
            <strong>Summary</strong>
            <span>{summary}</span>
          </div>
        </div>
      )}

      {intelligenceFeed.length > 0 && <IntelligenceFeed items={intelligenceFeed} />}

      {insights.length > 0 && (
        <div className="analyticsInsightGrid analyticsOverviewInsightGrid">
          {insights.map((item, i) => (
            <InsightCard key={`${item.title}-${i}`} {...item} />
          ))}
        </div>
      )}

      <AnomalySummary anomalies={anomalies} confidence={confidence} />

      <div className="analyticsKpiGrid">
        <Kpi
          ico={<MailIcon />}
          label="Sent"
          val={fmt(agg.sent)}
          clr={C.blue}
          delta={relDelta(agg.sent, aggPrev.sent)}
          goodUp
          spark={kpiTrend}
          sparkKey="sent"
          accent="blue"
          confidence={confidenceForMetric(current, 'sent')}
          onClick={() => onKpiDrilldown?.('sent')}
        />
        <Kpi
          ico={<CheckIcon />}
          label="Delivery rate"
          val={pctStr(agg.delivered, agg.sent)}
          clr={C.greenTxt}
          delta={ppDelta(pctNum(agg.delivered, agg.sent), pctNum(aggPrev.delivered, aggPrev.sent))}
          goodUp
          spark={kpiTrend}
          sparkKey="deliveryRate"
          accent="green"
          confidence={confidenceForMetric(current, 'deliveryRate')}
          onClick={() => onKpiDrilldown?.('deliveryRate')}
        />
        <Kpi
          ico={<EyeIcon />}
          label="Open rate"
          val={pctStr(agg.uniqueOpens, agg.delivered)}
          clr={C.green}
          delta={ppDelta(openNow, openPrev)}
          goodUp
          sub={`${fmt(agg.uniqueOpens)} unique`}
          spark={kpiTrend}
          sparkKey="openRate"
          accent="lime"
          confidence={confidenceForMetric(current, 'openRate')}
          onClick={() => onKpiDrilldown?.('openRate')}
        />
        <Kpi
          ico={<PointerIcon />}
          label="CTR"
          val={pctStr(agg.uniqueClicks, agg.delivered)}
          clr={C.purple}
          delta={ppDelta(ctrNow, ctrPrev)}
          goodUp
          sub={`${fmt(agg.uniqueClicks)} unique`}
          spark={kpiTrend}
          sparkKey="ctr"
          accent="purple"
          confidence={confidenceForMetric(current, 'ctr')}
          onClick={() => onKpiDrilldown?.('ctr')}
        />
        <Kpi
          ico={<TargetIcon />}
          label="CTOR"
          val={pctStr(agg.uniqueClicks, agg.uniqueOpens)}
          clr={C.purple}
          delta={ppDelta(
            pctNum(agg.uniqueClicks, agg.uniqueOpens),
            pctNum(aggPrev.uniqueClicks, aggPrev.uniqueOpens),
          )}
          goodUp
          sub="clicks / opens"
          spark={kpiTrend}
          sparkKey="ctor"
          accent="violet"
          confidence={confidenceForMetric(current, 'ctor')}
          onClick={() => onKpiDrilldown?.('ctor')}
        />
        <Kpi
          ico={<FlagIcon />}
          label="Complaint rate"
          val={complaintRate.toFixed(3) + '%'}
          clr={complaintRate > 0.1 ? C.red : C.green}
          delta={ppDelta(complaintRate, pctNum(aggPrev.complaints, aggPrev.delivered), 3)}
          goodUp={false}
          sub="target < 0.1%"
          spark={kpiTrend}
          sparkKey="complaintRate"
          accent="pink"
          confidence={confidenceForMetric(current, 'complaintRate')}
          onClick={() => onKpiDrilldown?.('complaintRate')}
        />
        <Kpi
          ico={<BounceIcon />}
          label="Bounce rate"
          val={pctStr(agg.hardBounces + agg.softBounces, agg.sent)}
          clr={bounceRate > 5 ? C.red : C.blue}
          delta={ppDelta(
            bounceRate,
            pctNum(aggPrev.hardBounces + aggPrev.softBounces, aggPrev.sent),
          )}
          goodUp={false}
          spark={kpiTrend}
          sparkKey="bounceRate"
          accent="blue"
          confidence={confidenceForMetric(current, 'bounceRate')}
          onClick={() => onKpiDrilldown?.('bounceRate')}
        />
        <Kpi
          ico={<BanIcon />}
          label="Unsubscribe"
          val={pctStr(agg.unsubscribes, agg.delivered)}
          clr={C.red}
          delta={ppDelta(
            pctNum(agg.unsubscribes, agg.delivered),
            pctNum(aggPrev.unsubscribes, aggPrev.delivered),
          )}
          goodUp={false}
          spark={kpiTrend}
          sparkKey="unsubRate"
          accent="red"
          confidence={confidenceForMetric(current, 'unsubRate')}
          onClick={() => onKpiDrilldown?.('unsubRate')}
        />
      </div>

      <Card
        title="Engagement over time"
        sub={`Delivered vs. unique opens vs. clicks${weekly ? ' · by week' : ''}`}
        className="analyticsEngagementCard"
        actions={
          <div className="chartActions no-print">
            <span className="chartPeriod">{weekly ? 'Weekly' : 'Daily'}</span>
            <button type="button" className="chartViewButton active" aria-label="Line chart">
              <TrendIcon />
            </button>
            <button type="button" className="chartViewButton" aria-label="Bar chart">
              <BarsIcon />
            </button>
          </div>
        }
      >
        <div className="analyticsChartWrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend} margin={{ top: 14, right: 14, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 4" stroke="var(--an-chart-grid)" vertical />
              <XAxis
                dataKey="d"
                tick={{ fontSize: 11, fill: 'var(--an-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--an-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<AnalyticsTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              <Line
                type="monotone"
                dataKey="delivered"
                stroke="#22a8ff"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
                name="Delivered"
              />
              <Line
                type="monotone"
                dataKey="opens"
                stroke="#84c561"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
                name="Unique opens"
              />
              <Line
                type="monotone"
                dataKey="clicks"
                stroke="#9b5cff"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
                name="Unique clicks"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <AnalyticsFeatureStrip />
    </>
  )
}

function ExecutiveOverview({
  current,
  previous,
  scopeCurrent,
  scopePrevious,
  campaigns,
  tplMap,
  meta,
}) {
  const agg = useMemo(() => sumRows(current), [current])
  const aggPrev = useMemo(() => sumRows(previous), [previous])
  const metrics = metricsFromAgg(agg)
  const prevMetrics = metricsFromAgg(aggPrev)
  const healthScore = buildHealthScore(agg)
  const health = healthLabel(healthScore)
  const quality = analyzeDataQuality(current, tplMap, campaigns)
  const campaignGroups = useMemo(
    () => enrichCampaignGroups(buildCampaignGroups(current, campaigns)),
    [current, campaigns],
  )
  const topCampaign = [...campaignGroups].sort((a, b) => b.uniqueClicks - a.uniqueClicks)[0]
  const riskCampaign = [...campaignGroups]
    .filter((g) => g.status?.tone === 'bad' || g.status?.tone === 'warning')
    .sort((a, b) => a.open - b.open)[0]
  const intelligence = buildIntelligenceFeed({
    current,
    previous,
    scopeCurrent,
    scopePrevious,
    campaigns,
    tplMap,
  }).slice(0, 4)
  const brief = useMemo(
    () => buildWeeklyBrief(current, campaigns, tplMap),
    [current, campaigns, tplMap],
  )
  const trend = useMemo(() => buildKpiTrend(current, false).slice(-30), [current])

  return (
    <>
      <div className="analyticsExecutiveHero">
        <div>
          <span className="analyticsIntelEyebrow">EXECUTIVE OVERVIEW</span>
          <h2>Marketing performance at a glance</h2>
          <p>
            A decision-focused view of engagement, deliverability, campaign momentum and reporting
            quality inside the active filters.
          </p>
        </div>
        <div className={`analyticsExecutiveScore analyticsExecutiveScore-${health.tone}`}>
          <span>Marketing health</span>
          <strong>{healthScore}</strong>
          <small>
            {health.label} · data quality {quality.score}/100
          </small>
        </div>
      </div>

      <div className="analyticsExecutiveKpis">
        <ExecutiveMetric
          label="Delivered reach"
          value={fmt(agg.delivered)}
          delta={relDelta(agg.delivered, aggPrev.delivered)}
          detail={`${metrics.delivery.toFixed(1)}% delivery rate`}
          tone="blue"
        />
        <ExecutiveMetric
          label="Open rate"
          value={`${metrics.open.toFixed(1)}%`}
          delta={ppDelta(metrics.open, prevMetrics.open)}
          detail={`${fmt(agg.uniqueOpens)} unique opens`}
          tone="green"
        />
        <ExecutiveMetric
          label="CTR"
          value={`${metrics.ctr.toFixed(1)}%`}
          delta={ppDelta(metrics.ctr, prevMetrics.ctr)}
          detail={`${fmt(agg.uniqueClicks)} unique clicks`}
          tone="purple"
        />
        <ExecutiveMetric
          label="Data quality"
          value={`${quality.score}/100`}
          detail={`${quality.issues?.length || 0} active quality finding${quality.issues?.length === 1 ? '' : 's'}`}
          tone={quality.score >= 90 ? 'green' : quality.score >= 75 ? 'amber' : 'red'}
        />
      </div>

      <div className="analyticsExecutiveGrid">
        <Card
          title="What matters now"
          sub="Highest-priority signals from campaign, audience and data-quality intelligence"
          className="analyticsExecutiveSignals"
        >
          {intelligence.length ? (
            <div className="analyticsExecutiveSignalList">
              {intelligence.map((item, index) => (
                <div
                  className={`analyticsExecutiveSignal ${item.severity || item.tone || 'info'}`}
                  key={`${item.title}-${index}`}
                >
                  <span className="analyticsExecutiveSignalMark">{index + 1}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    {item.action && <small>{item.action}</small>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="analyticsHealthyState">
              <ShieldIcon />
              <strong>No material risk signal in the current scope</strong>
              <span>Performance is inside the dashboard's current comparison thresholds.</span>
            </div>
          )}
        </Card>

        <Card
          title="Leadership snapshot"
          sub="The strongest result and the clearest place to investigate"
        >
          <div className="analyticsLeadershipCards">
            <div className="analyticsLeadershipCard positive">
              <span>Top campaign by unique clicks</span>
              <strong>{topCampaign?.label || '—'}</strong>
              <p>
                {topCampaign
                  ? `${fmt(topCampaign.uniqueClicks)} clicks · ${topCampaign.ctr.toFixed(1)}% CTR · ${topCampaign.open.toFixed(1)}% open`
                  : 'No campaign activity in the selected scope.'}
              </p>
            </div>
            <div className={`analyticsLeadershipCard ${riskCampaign ? 'warning' : 'positive'}`}>
              <span>{riskCampaign ? 'Needs attention' : 'Risk check'}</span>
              <strong>{riskCampaign?.label || 'No campaign flagged'}</strong>
              <p>
                {riskCampaign
                  ? `${riskCampaign.open.toFixed(1)}% open · ${riskCampaign.ctr.toFixed(1)}% CTR · ${riskCampaign.status.label}`
                  : 'No campaign currently falls into the dashboard warning/risk band.'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card title="30-day executive trend" sub="Open rate, CTR and delivery rate · daily">
        <ResponsiveContainer width="100%" height={245}>
          <LineChart data={trend} margin={{ top: 8, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
            <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.mid }} />
            <YAxis tick={{ fontSize: 10, fill: C.mid }} unit="%" />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="openRate"
              name="Open %"
              stroke={C.green}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="ctr"
              name="CTR %"
              stroke={C.purple}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="deliveryRate"
              name="Delivery %"
              stroke={C.blue}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <WeeklyBriefCard brief={brief} meta={meta} />
    </>
  )
}

function ExecutiveMetric({ label, value, delta, detail, tone = 'blue' }) {
  return (
    <div className={`analyticsExecutiveMetric ${tone}`}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        {delta && <DeltaBadge delta={delta} goodUp />}
      </div>
      <p>{detail}</p>
    </div>
  )
}

function WeeklyBriefCard({ brief, meta }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be blocked by browser policy; the download action remains available.
    }
  }

  const download = () =>
    downloadTextFile(`marketing-weekly-brief-${brief.endDate || 'latest'}.txt`, brief.text)

  return (
    <Card
      title="Automatic weekly marketing brief"
      sub={`Rolling 7-day brief vs the preceding 7 days · inherits the active channel/region/campaign scope`}
      className="analyticsWeeklyBriefCard"
      actions={
        <div className="analyticsBriefActions no-print">
          <button type="button" className="analyticsTextButton" onClick={copy}>
            <CopyIcon /> {copied ? 'Copied' : 'Copy brief'}
          </button>
          <button type="button" className="analyticsTextButton" onClick={download}>
            <DownloadIcon /> Download
          </button>
        </div>
      }
    >
      {!brief.hasData ? (
        <Empty>Not enough activity is available to generate a weekly brief.</Empty>
      ) : (
        <div className="analyticsWeeklyBrief">
          <div className="analyticsBriefHeader">
            <div>
              <span>WEEK ENDING</span>
              <strong>{brief.endLabel}</strong>
            </div>
            <div>
              <span>SCOPE</span>
              <strong>
                {meta.channel} · {meta.region} · {meta.campaign}
              </strong>
            </div>
          </div>
          <div className="analyticsBriefMetrics">
            {brief.metrics.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <MetricDelta value={item.delta} suffix={item.suffix || 'pp'} />
              </div>
            ))}
          </div>
          <div className="analyticsBriefNarrative">
            <h3>What changed</h3>
            <ul>
              {brief.bullets.map((bullet, i) => (
                <li key={`${bullet}-${i}`}>{bullet}</li>
              ))}
            </ul>
          </div>
          <div className="analyticsBriefRecommendation">
            <SparkleIcon />
            <div>
              <span>Recommended focus</span>
              <strong>{brief.recommendation}</strong>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function CampaignsTab({
  current,
  previous,
  scopeCurrent,
  scopePrevious,
  campaigns,
  templateCatalog,
  onCampaignCreated,
  openBuilderSignal = 0,
}) {
  const [drillName, setDrillName] = useState(null)
  const [compareNames, setCompareNames] = useState([])
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderMode, setBuilderMode] = useState('create')
  const [builderCampaign, setBuilderCampaign] = useState(null)
  const [campaignActionError, setCampaignActionError] = useState('')

  const openBuilder = useCallback((mode = 'create', source = null) => {
    setBuilderMode(mode)
    setBuilderCampaign(source)
    setBuilderOpen(true)
    setCampaignActionError('')
  }, [])

  useEffect(() => {
    if (openBuilderSignal > 0) openBuilder('create')
  }, [openBuilderSignal, openBuilder])

  const updateCampaignStatus = async (item, status) => {
    if (!item?.id) return
    if (
      status === 'archived' &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `Archive “${item.name}”? It will remain available in history and can be restored later.`,
      )
    )
      return
    setCampaignActionError('')
    try {
      const response = await fetch(`${API}/campaigns/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.message || 'Could not update campaign status.')
      await onCampaignCreated?.()
    } catch (error) {
      setCampaignActionError(error?.message || 'Could not update campaign status.')
    }
  }

  if (!campaigns.length)
    return (
      <>
        <Card
          title="Campaign Intelligence"
          sub="Create your first campaign and assign the templates that belong to it."
          actions={
            <button
              type="button"
              className="analyticsPrimaryButton no-print"
              onClick={() => openBuilder('create')}
            >
              <PlusIcon /> New Campaign
            </button>
          }
        >
          <Empty>
            No campaigns yet. Create one here — you no longer need to leave the analytics app for
            the Payload admin.
          </Empty>
        </Card>
        {builderOpen && (
          <CampaignBuilderModal
            templates={templateCatalog}
            campaigns={campaigns}
            mode={builderMode}
            campaign={builderCampaign}
            onClose={() => setBuilderOpen(false)}
            onCreated={async () => {
              await onCampaignCreated?.()
              setBuilderOpen(false)
            }}
          />
        )}
      </>
    )

  const visibleGroups = buildCampaignGroups(current, campaigns)
  const visiblePrevByName = new Map(
    buildCampaignGroups(previous, campaigns).map((g) => [g.label, g]),
  )
  const cohortGroups = buildCampaignGroups(scopeCurrent, campaigns)
  const cohortPrevByName = new Map(
    buildCampaignGroups(scopePrevious, campaigns).map((g) => [g.label, g]),
  )

  const cohortEnriched = enrichCampaignGroups(cohortGroups, cohortPrevByName)
  const benchmark = buildCampaignBenchmark(cohortEnriched)
  const enriched = enrichCampaignGroups(visibleGroups, visiblePrevByName, benchmark)

  if (drillName) {
    const campaign = campaigns.find((c) => c.name === drillName)
    if (campaign) {
      return (
        <Campaign360View
          campaign={campaign}
          current={scopeCurrent}
          previous={scopePrevious}
          cohort={cohortEnriched}
          onClose={() => setDrillName(null)}
        />
      )
    }
  }

  const populated = enriched.filter((g) => g.sent > 0)
  const bestOpen = [...populated].sort((a, b) => b.open - a.open)[0]
  const bestCtr = [...populated].sort((a, b) => b.ctr - a.ctr)[0]
  const biggestMover = [...populated]
    .filter((g) => Number.isFinite(g.openDelta))
    .sort((a, b) => Math.abs(b.openDelta) - Math.abs(a.openDelta))[0]
  const needsAttention = populated.find((g) => g.status.tone === 'bad')
  const intelligence = buildCampaignIntelligence(populated, benchmark)

  const toggleCompare = (name) => {
    setCompareNames((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name)
      if (prev.length >= 4) return [...prev.slice(1), name]
      return [...prev, name]
    })
  }

  const comparison = compareNames
    .map((name) => cohortEnriched.find((g) => g.label === name))
    .filter(Boolean)

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">CAMPAIGN INTELLIGENCE</span>
          <h2>What is driving performance?</h2>
          <p>
            The benchmark engine uses the median and interquartile range of comparable campaigns
            inside the current date, channel and region scope, so high-volume campaigns cannot
            distort the benchmark.
          </p>
        </div>
        <div className="analyticsIntelHeaderActions no-print">
          <div className="analyticsBenchmarkPill analyticsBenchmarkEnginePill">
            <span>Comparable-campaign median</span>
            <strong>
              {benchmark.open.toFixed(1)}% open · {benchmark.ctr.toFixed(1)}% CTR
            </strong>
            <small>
              {benchmark.count} campaign{benchmark.count === 1 ? '' : 's'} in cohort
            </small>
          </div>
          <button
            type="button"
            className="analyticsPrimaryButton"
            onClick={() => openBuilder('create')}
          >
            <PlusIcon /> New Campaign
          </button>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Best open rate"
          value={bestOpen ? `${bestOpen.open.toFixed(1)}%` : '—'}
          detail={bestOpen?.label || 'No campaign data'}
          tone="green"
          icon={<EyeIcon />}
        />
        <MiniStat
          label="Best CTR"
          value={bestCtr ? `${bestCtr.ctr.toFixed(1)}%` : '—'}
          detail={bestCtr?.label || 'No campaign data'}
          tone="purple"
          icon={<PointerIcon />}
        />
        <MiniStat
          label="Biggest movement"
          value={
            biggestMover
              ? `${biggestMover.openDelta >= 0 ? '+' : ''}${biggestMover.openDelta.toFixed(1)}pp`
              : '—'
          }
          detail={biggestMover?.label || 'No previous-period signal'}
          tone={biggestMover?.openDelta >= 0 ? 'green' : 'amber'}
          icon={<TrendIcon />}
        />
        <MiniStat
          label="Needs attention"
          value={needsAttention ? needsAttention.status.label : 'Healthy'}
          detail={needsAttention?.label || 'No high-risk campaign detected'}
          tone={needsAttention ? 'red' : 'green'}
          icon={<AlertIcon />}
        />
      </div>

      <Card
        title="Benchmark engine"
        sub="Median + IQR across comparable campaigns · weighted-volume distortion removed"
      >
        <div className="analyticsBenchmarkGrid">
          <BenchmarkMetric label="Open rate" metric={benchmark.openStats} suffix="%" tone="green" />
          <BenchmarkMetric label="CTR" metric={benchmark.ctrStats} suffix="%" tone="purple" />
          <BenchmarkMetric label="CTOR" metric={benchmark.ctorStats} suffix="%" tone="blue" />
          <BenchmarkMetric
            label="Delivery"
            metric={benchmark.deliveryStats}
            suffix="%"
            tone="green"
          />
        </div>
      </Card>

      {intelligence.length > 0 && (
        <div className="analyticsInsightGrid">
          {intelligence.map((item, i) => (
            <InsightCard key={`${item.title}-${i}`} {...item} />
          ))}
        </div>
      )}

      <Card
        title="Campaign comparison lab"
        sub="Select 2–4 campaigns for a normalized side-by-side comparison"
        actions={
          <button
            type="button"
            className="analyticsTextButton no-print"
            onClick={() => setCompareNames(cohortEnriched.slice(0, 3).map((g) => g.label))}
            disabled={cohortEnriched.length < 2}
          >
            Compare top {Math.min(3, cohortEnriched.length)}
          </button>
        }
      >
        <div className="analyticsComparePicker no-print">
          {cohortEnriched.map((g) => {
            const active = compareNames.includes(g.label)
            return (
              <button
                type="button"
                key={g.label}
                className={`analyticsCompareChip ${active ? 'active' : ''}`}
                onClick={() => toggleCompare(g.label)}
              >
                <span className="analyticsCampaignDot" style={{ background: g.color || C.mid }} />
                {g.label}
                {active && <CheckIcon />}
              </button>
            )
          })}
        </div>

        {comparison.length >= 2 ? (
          <CampaignComparison groups={comparison} benchmark={benchmark} />
        ) : (
          <Empty>
            Select at least two campaigns to compare. Up to four can be compared at once.
          </Empty>
        )}
      </Card>

      <Card
        title="Campaign performance"
        sub="Open rate and CTR by campaign · current filtered period"
      >
        {populated.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={populated.map((g) => ({
                name: g.label,
                open: +g.open.toFixed(1),
                ctr: +g.ctr.toFixed(1),
              }))}
              margin={{ top: 6, right: 12, left: -8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.mid }} />
              <YAxis tick={{ fontSize: 11, fill: C.mid }} unit="%" />
              <Tooltip content={<AnalyticsTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="open" fill={C.green} name="Open rate %" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ctr" fill={C.purple} name="CTR %" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty>No campaign has data in the selected period.</Empty>
        )}
      </Card>

      <Card
        title="Campaign leaderboard"
        sub="Open a 360° view for timeline, cohort benchmark, region, channel and template contribution"
      >
        <div className="analyticsTableWrap">
          <table className="analyticsDataTable analyticsCampaignTable">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Templates</th>
                <th>Sent</th>
                <th>Delivery</th>
                <th>Open</th>
                <th>vs prev.</th>
                <th>CTR</th>
                <th>CTOR</th>
                <th>Bounce</th>
                <th className="no-print">Explore</th>
              </tr>
            </thead>
            <tbody>
              {populated.length === 0 && (
                <tr>
                  <td colSpan={11} className="analyticsTableEmpty">
                    No data
                  </td>
                </tr>
              )}
              {populated.map((g) => (
                <tr key={g.label}>
                  <td>
                    <div className="analyticsCampaignName">
                      <span
                        className="analyticsCampaignDot"
                        style={{ background: g.color || C.mid }}
                      />
                      <div>
                        <strong>{g.label}</strong>
                        <span>
                          {g.templateCount} assigned template{g.templateCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusBadge {...g.status} />
                  </td>
                  <td>{g.templateCount}</td>
                  <td>{fmt(g.sent)}</td>
                  <td>{g.delivery.toFixed(1)}%</td>
                  <td>
                    <strong style={{ color: rateColor(g.open) }}>{g.open.toFixed(1)}%</strong>
                  </td>
                  <td>
                    <MetricDelta value={g.openDelta} />
                  </td>
                  <td>
                    <strong style={{ color: C.purple }}>{g.ctr.toFixed(1)}%</strong>
                  </td>
                  <td>{g.ctor.toFixed(1)}%</td>
                  <td className={g.bounce > 5 ? 'analyticsRiskText' : ''}>
                    {g.bounce.toFixed(1)}%
                  </td>
                  <td className="no-print">
                    <button
                      type="button"
                      className="analyticsExploreButton"
                      onClick={() => setDrillName(g.label)}
                    >
                      360° <ArrowRightIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Campaign management"
        sub="Edit assignments and campaign metadata, duplicate proven structures, or archive campaigns without leaving Analytics"
      >
        {campaignActionError && <Banner>{campaignActionError}</Banner>}
        <div className="analyticsCampaignManagementList">
          {campaigns.map((item) => (
            <div className="analyticsCampaignManagementRow" key={item.id || item.name}>
              <div className="analyticsCampaignManagementIdentity">
                <span
                  className="analyticsCampaignDot"
                  style={{ background: item.color || C.mid }}
                />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.keys.length} template{item.keys.length === 1 ? '' : 's'} ·{' '}
                    {item.status || 'active'}
                    {item.updatedAt ? ` · updated ${formatRelativeTime(item.updatedAt)}` : ''}
                  </span>
                </div>
              </div>
              <div className="analyticsCampaignManagementActions no-print">
                <button
                  type="button"
                  className="analyticsTextButton"
                  onClick={() => openBuilder('edit', item)}
                >
                  <EditIcon /> Edit
                </button>
                <button
                  type="button"
                  className="analyticsTextButton"
                  onClick={() => openBuilder('duplicate', item)}
                >
                  <CopyIcon /> Duplicate
                </button>
                <button
                  type="button"
                  className={`analyticsTextButton ${item.status === 'archived' ? 'positive' : 'danger'}`}
                  onClick={() =>
                    updateCampaignStatus(item, item.status === 'archived' ? 'active' : 'archived')
                  }
                >
                  {item.status === 'archived' ? (
                    <>
                      <RestoreIcon /> Restore
                    </>
                  ) : (
                    <>
                      <ArchiveIcon /> Archive
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <CampaignCalendar current={current} campaigns={campaigns} />

      {builderOpen && (
        <CampaignBuilderModal
          templates={templateCatalog}
          campaigns={campaigns}
          mode={builderMode}
          campaign={builderCampaign}
          onClose={() => setBuilderOpen(false)}
          onCreated={async () => {
            await onCampaignCreated?.()
            setBuilderOpen(false)
          }}
        />
      )}
    </>
  )
}

function CampaignBuilderModal({
  templates = [],
  campaigns = [],
  mode = 'create',
  campaign = null,
  onClose,
  onCreated,
}) {
  const isEdit = mode === 'edit'
  const isDuplicate = mode === 'duplicate'
  const [name, setName] = useState(() =>
    isDuplicate ? `${campaign?.name || 'Campaign'} Copy` : campaign?.name || '',
  )
  const [description, setDescription] = useState(() => campaign?.description || '')
  const [notes, setNotes] = useState(() => campaign?.notes || '')
  const [status, setStatus] = useState(() => (isDuplicate ? 'draft' : campaign?.status || 'active'))
  const [color, setColor] = useState(() => campaign?.color || '#84c561')
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('All')
  const [selected, setSelected] = useState(() => new Set(campaign?.templateIds || []))
  const [expanded, setExpanded] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const themes = useMemo(
    () => ['All', ...new Set(templates.map((item) => item.theme).filter(Boolean))],
    [templates],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return templates.filter((item) => {
      if (theme !== 'All' && item.theme !== theme) return false
      if (!q) return true
      return [item.name, item.key, item.family, item.theme]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [templates, search, theme])

  const groups = useMemo(() => {
    const byFamily = new Map()
    for (const item of filtered) {
      const family = item.family || familyOfName(item.name)
      if (!byFamily.has(family)) byFamily.set(family, [])
      byFamily.get(family).push(item)
    }
    return [...byFamily.entries()]
      .map(([family, items]) => ({
        family,
        items: [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        theme: items[0]?.theme || 'Other',
      }))
      .sort((a, b) => a.family.localeCompare(b.family))
  }, [filtered])

  const selectedTemplates = useMemo(
    () => templates.filter((item) => selected.has(item.id)),
    [templates, selected],
  )

  const toggleTemplate = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError('')
  }

  const toggleFamily = (items) => {
    const ids = items.map((item) => item.id)
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id))
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
      return next
    })
    setError('')
  }

  const toggleExpanded = (family) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(family)) next.delete(family)
      else next.add(family)
      return next
    })
  }

  const selectFiltered = () => {
    setSelected((current) => {
      const next = new Set(current)
      for (const item of filtered) next.add(item.id)
      return next
    })
    setError('')
  }

  const clearSelected = () => {
    setSelected(new Set())
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return

    const cleanName = name.trim()
    if (!cleanName) {
      setError('Campaign name is required.')
      return
    }
    if (
      campaigns.some(
        (item) =>
          String(item.id) !== String(campaign?.id) &&
          (item.name || '').trim().toLowerCase() === cleanName.toLowerCase(),
      )
    ) {
      setError('A campaign with this name already exists. Use a unique campaign name.')
      return
    }
    if (!selected.size) {
      setError('Assign at least one template so the campaign can be analyzed immediately.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const response = await fetch(
        isEdit ? `${API}/campaigns/${campaign.id}` : `${API}/campaigns`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(isDuplicate ? { 'x-analytics-action': 'duplicated' } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            name: cleanName,
            description: description.trim() || undefined,
            notes: notes.trim() || undefined,
            status,
            color,
            templates: [...selected],
          }),
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message =
          data?.errors?.[0]?.message ||
          data?.message ||
          'Could not create the campaign. Please try again.'
        throw new Error(message)
      }
      await onCreated?.(data?.doc || data)
    } catch (err) {
      setError(err?.message || 'Could not create the campaign. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div
      className="analyticsModalBackdrop no-print"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onClose?.()
      }}
    >
      <div
        className="analyticsCampaignBuilder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-builder-title"
      >
        <div className="analyticsBuilderHeader">
          <div>
            <span className="analyticsIntelEyebrow">CAMPAIGN WORKFLOW</span>
            <h2 id="campaign-builder-title">
              {isEdit ? 'Edit campaign' : isDuplicate ? 'Duplicate campaign' : 'Create a campaign'}
            </h2>
            <p>
              {isEdit
                ? 'Update campaign metadata and template assignments. Changes are recorded in the activity log.'
                : isDuplicate
                  ? 'Start from an existing campaign structure, then adjust the name, status and assigned templates.'
                  : 'Define the campaign once, then assign canonical templates from the existing template library.'}
            </p>
          </div>
          <button
            type="button"
            className="analyticsModalClose"
            onClick={onClose}
            disabled={saving}
            aria-label="Close campaign builder"
          >
            <XIcon />
          </button>
        </div>

        <form onSubmit={submit} className="analyticsBuilderForm">
          <div className="analyticsBuilderDetails">
            <label className="analyticsBuilderField analyticsBuilderFieldWide">
              <span>
                Campaign name <b>*</b>
              </span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError('')
                }}
                placeholder="e.g. Q4 Reactivation"
                autoFocus
              />
            </label>

            <label className="analyticsBuilderField">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </label>

            <label className="analyticsBuilderField analyticsBuilderColorField">
              <span>Color</span>
              <div className="analyticsColorInput">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Campaign color"
                />
                <code>{color.toUpperCase()}</code>
              </div>
            </label>

            <label className="analyticsBuilderField analyticsBuilderFieldFull">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional context for the marketing team…"
                rows={2}
              />
            </label>

            <label className="analyticsBuilderField analyticsBuilderFieldFull">
              <span>Internal notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Handoff notes, objectives, special conditions…"
                rows={2}
              />
            </label>
          </div>

          <div className="analyticsTemplatePicker">
            <div className="analyticsPickerHeading">
              <div>
                <h3>Assign templates</h3>
                <p>
                  {templates.length} canonical templates available · {selected.size} selected
                </p>
              </div>
              <div className="analyticsPickerActions">
                <button
                  type="button"
                  className="analyticsTextButton"
                  onClick={selectFiltered}
                  disabled={!filtered.length}
                >
                  Select filtered
                </button>
                <button
                  type="button"
                  className="analyticsTextButton"
                  onClick={clearSelected}
                  disabled={!selected.size}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="analyticsPickerFilters">
              <div className="analyticsPickerSearch">
                <SearchIcon />
                <input
                  aria-label="Search templates"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search template, key or family…"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear template search"
                  >
                    <XIcon />
                  </button>
                )}
              </div>
              <label className="analyticsPickerTheme">
                <span>Theme</span>
                <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {themes.map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="analyticsPickerMeta">
              <span>
                {filtered.length} template{filtered.length === 1 ? '' : 's'} across {groups.length}{' '}
                famil{groups.length === 1 ? 'y' : 'ies'}
              </span>
              {selected.size > 0 && <strong>{selected.size} selected</strong>}
            </div>

            <div className="analyticsFamilyList">
              {groups.length === 0 && (
                <Empty>No templates match the current search and theme filter.</Empty>
              )}
              {groups.map((group) => {
                const ids = group.items.map((item) => item.id)
                const selectedCount = ids.filter((id) => selected.has(id)).length
                const allSelected = selectedCount === ids.length && ids.length > 0
                const partial = selectedCount > 0 && !allSelected
                const isOpen = Boolean(search.trim()) || expanded.has(group.family)
                return (
                  <div
                    className={`analyticsFamilyGroup ${isOpen ? 'open' : ''}`}
                    key={group.family}
                  >
                    <div className="analyticsFamilyHeader">
                      <button
                        type="button"
                        className={`analyticsFamilyCheck ${allSelected ? 'checked' : partial ? 'partial' : ''}`}
                        onClick={() => toggleFamily(group.items)}
                        aria-pressed={allSelected ? true : partial ? 'mixed' : false}
                        aria-label={`${allSelected ? 'Unselect' : 'Select'} ${group.family} family`}
                      >
                        {allSelected ? <CheckIcon /> : partial ? <span>−</span> : null}
                      </button>
                      <button
                        type="button"
                        className="analyticsFamilyToggle"
                        onClick={() => toggleExpanded(group.family)}
                        aria-expanded={isOpen}
                      >
                        <div>
                          <strong>{group.family}</strong>
                          <span>
                            {group.theme} · {group.items.length} template
                            {group.items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="analyticsFamilyCount">
                          {selectedCount > 0 && <b>{selectedCount} selected</b>}
                          <ChevronDownIcon />
                        </div>
                      </button>
                    </div>

                    {isOpen && (
                      <div className="analyticsFamilyTemplates">
                        {group.items.map((item) => {
                          const checked = selected.has(item.id)
                          return (
                            <button
                              type="button"
                              className={`analyticsTemplateChoice ${checked ? 'selected' : ''}`}
                              key={item.id}
                              onClick={() => toggleTemplate(item.id)}
                              aria-pressed={checked}
                            >
                              <span className="analyticsTemplateCheckbox">
                                {checked && <CheckIcon />}
                              </span>
                              <span className="analyticsTemplateChoiceCopy">
                                <strong>{item.name}</strong>
                                <code>{item.key}</code>
                              </span>
                              <span className="analyticsTemplateThemeBadge">{item.theme}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {selectedTemplates.length > 0 && (
              <div className="analyticsSelectedSummary">
                <span>Selected templates</span>
                <div>
                  {selectedTemplates.slice(0, 6).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => toggleTemplate(item.id)}
                      title="Remove template"
                    >
                      {item.name} <XIcon />
                    </button>
                  ))}
                  {selectedTemplates.length > 6 && (
                    <small>+{selectedTemplates.length - 6} more</small>
                  )}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="analyticsBuilderError">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          <div className="analyticsBuilderFooter">
            <div>
              <strong>{selected.size}</strong>
              <span>template{selected.size === 1 ? '' : 's'} assigned</span>
            </div>
            <div className="analyticsBuilderFooterActions">
              <button
                type="button"
                className="analyticsSecondaryButton"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="analyticsPrimaryButton"
                disabled={saving || !name.trim() || !selected.size}
              >
                {saving ? (
                  <>
                    <ButtonSpinner />{' '}
                    {isEdit ? 'Saving…' : isDuplicate ? 'Duplicating…' : 'Creating…'}
                  </>
                ) : isEdit ? (
                  <>
                    <CheckIcon /> Save changes
                  </>
                ) : isDuplicate ? (
                  <>
                    <CopyIcon /> Duplicate campaign
                  </>
                ) : (
                  <>
                    <PlusIcon /> Create campaign
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function ButtonSpinner() {
  return <span className="analyticsButtonSpinner" aria-hidden="true" />
}

function CampaignCalendar({ current, campaigns }) {
  const entries = useMemo(
    () => buildCampaignCalendarEntries(current, campaigns),
    [current, campaigns],
  )
  const months = useMemo(() => [...new Set(entries.map((item) => item.month))].sort(), [entries])
  const [month, setMonth] = useState(() => months[months.length - 1] || '')

  useEffect(() => {
    if (!months.length) {
      if (month) setMonth('')
      return
    }
    if (!month || !months.includes(month)) setMonth(months[months.length - 1])
  }, [months, month])

  if (!entries.length) {
    return (
      <Card
        title="Campaign calendar"
        sub="Campaign activity mapped from assigned template activity"
      >
        <Empty>No campaign activity is available for the selected filters.</Empty>
      </Card>
    )
  }

  const monthIndex = Math.max(0, months.indexOf(month))
  const monthEntries = entries.filter((item) => item.month === month)
  const byDay = new Map()
  for (const item of monthEntries) {
    if (!byDay.has(item.date)) byDay.set(item.date, [])
    byDay.get(item.date).push(item)
  }
  for (const list of byDay.values()) list.sort((a, b) => b.sent - a.sent)

  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const firstDow = (first.getDay() + 6) % 7
  const cells = []
  for (let i = 0; i < firstDow; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  while (cells.length % 7) cells.push(null)

  const totalSends = monthEntries.reduce((sum, item) => sum + item.sent, 0)
  const activeDays = byDay.size
  const busiest = [...byDay.entries()]
    .map(([date, list]) => ({ date, sent: list.reduce((sum, item) => sum + item.sent, 0) }))
    .sort((a, b) => b.sent - a.sent)[0]

  const move = (step) => {
    const next = Math.min(months.length - 1, Math.max(0, monthIndex + step))
    setMonth(months[next])
  }

  return (
    <Card
      title="Campaign calendar"
      sub="Daily campaign activity inferred from assigned template sends · overlapping campaign assignments can attribute the same template activity to more than one campaign"
      className="analyticsCampaignCalendarCard"
      actions={
        <div className="analyticsCalendarNav no-print">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={monthIndex <= 0}
            aria-label="Previous month"
          >
            <ArrowLeftIcon />
          </button>
          <strong>{calendarMonthLabel(month)}</strong>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={monthIndex >= months.length - 1}
            aria-label="Next month"
          >
            <ArrowRightIcon />
          </button>
        </div>
      }
    >
      <div className="analyticsCalendarSummary">
        <div>
          <span>Attributed sends</span>
          <strong>{fmt(totalSends)}</strong>
        </div>
        <div>
          <span>Active days</span>
          <strong>{activeDays}</strong>
        </div>
        <div>
          <span>Busiest day</span>
          <strong>{busiest ? formatShortDate(busiest.date) : '—'}</strong>
        </div>
        <div>
          <span>Campaigns active</span>
          <strong>{new Set(monthEntries.map((item) => item.campaign)).size}</strong>
        </div>
      </div>

      <div className="analyticsCalendarGrid">
        {DOW.map((day) => (
          <div className="analyticsCalendarDow" key={day}>
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div className="analyticsCalendarCell empty" key={`empty-${index}`} />
          const date = `${year}-${String(monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const items = byDay.get(date) || []
          return (
            <div className={`analyticsCalendarCell ${items.length ? 'active' : ''}`} key={date}>
              <div className="analyticsCalendarDate">{day}</div>
              <div className="analyticsCalendarEvents">
                {items.slice(0, 3).map((item) => (
                  <div
                    className="analyticsCalendarEvent"
                    key={`${date}-${item.campaign}`}
                    title={`${item.campaign}: ${fmt(item.sent)} sent · ${item.open.toFixed(1)}% open · ${item.ctr.toFixed(1)}% CTR`}
                  >
                    <i style={{ background: item.color || C.blue }} />
                    <div>
                      <strong>{item.campaign}</strong>
                      <span>
                        {fmt(item.sent)} sent · {item.ctr.toFixed(1)}% CTR
                      </span>
                    </div>
                  </div>
                ))}
                {items.length > 3 && <small>+{items.length - 3} more</small>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function BenchmarkMetric({ label, metric, suffix = '', tone = 'blue' }) {
  return (
    <div className={`analyticsBenchmarkMetric ${tone}`}>
      <div className="analyticsBenchmarkMetricTop">
        <span>{label}</span>
        <strong>
          {metric.median.toFixed(1)}
          {suffix}
        </strong>
      </div>
      <div className="analyticsBenchmarkTrack">
        <span
          className="analyticsBenchmarkRange"
          style={{
            left: `${metric.q1Pct}%`,
            width: `${Math.max(2, metric.q3Pct - metric.q1Pct)}%`,
          }}
        />
        <i style={{ left: `${metric.medianPct}%` }} />
      </div>
      <small>
        P25 {metric.q1.toFixed(1)}
        {suffix} · P75 {metric.q3.toFixed(1)}
        {suffix}
      </small>
    </div>
  )
}

function CampaignComparison({ groups, benchmark }) {
  const chart = groups.map((g) => ({
    name: g.label,
    open: +g.open.toFixed(1),
    ctr: +g.ctr.toFixed(1),
    ctor: +g.ctor.toFixed(1),
  }))
  const clickWinner = [...groups].sort((a, b) => b.uniqueClicks - a.uniqueClicks)[0]
  const efficiencyWinner = [...groups].sort((a, b) => b.ctor - a.ctor)[0]
  const volumeLeader = [...groups].sort((a, b) => b.sent - a.sent)[0]

  return (
    <div className="analyticsComparisonWrap">
      <div className="analyticsComparisonCallouts">
        <div>
          <span>Most clicks</span>
          <strong>{clickWinner.label}</strong>
          <small>{fmt(clickWinner.uniqueClicks)} unique</small>
        </div>
        <div>
          <span>Best click efficiency</span>
          <strong>{efficiencyWinner.label}</strong>
          <small>{efficiencyWinner.ctor.toFixed(1)}% CTOR</small>
        </div>
        <div>
          <span>Highest volume</span>
          <strong>{volumeLeader.label}</strong>
          <small>{fmt(volumeLeader.sent)} sent</small>
        </div>
      </div>

      <div className="analyticsComparisonChart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chart} margin={{ top: 12, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.mid }} />
            <YAxis tick={{ fontSize: 10, fill: C.mid }} unit="%" />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="open" name="Open %" fill={C.green} radius={[4, 4, 0, 0]} />
            <Bar dataKey="ctr" name="CTR %" fill={C.purple} radius={[4, 4, 0, 0]} />
            <Bar dataKey="ctor" name="CTOR %" fill={C.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="analyticsTableWrap">
        <table className="analyticsDataTable analyticsComparisonTable">
          <thead>
            <tr>
              <th>Metric</th>
              {groups.map((g) => (
                <th key={g.label}>{g.label}</th>
              ))}
              <th>Benchmark</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Sent', (g) => fmt(g.sent), '—'],
              ['Delivery', (g) => `${g.delivery.toFixed(1)}%`, `${benchmark.delivery.toFixed(1)}%`],
              ['Open rate', (g) => `${g.open.toFixed(1)}%`, `${benchmark.open.toFixed(1)}%`],
              ['CTR', (g) => `${g.ctr.toFixed(1)}%`, `${benchmark.ctr.toFixed(1)}%`],
              ['CTOR', (g) => `${g.ctor.toFixed(1)}%`, `${benchmark.ctor.toFixed(1)}%`],
              ['Bounce', (g) => `${g.bounce.toFixed(1)}%`, `${benchmark.bounce.toFixed(1)}%`],
              [
                'Complaints',
                (g) => `${g.complaints.toFixed(3)}%`,
                `${benchmark.complaints.toFixed(3)}%`,
              ],
            ].map(([label, fn, bench]) => (
              <tr key={label}>
                <td>
                  <strong>{label}</strong>
                </td>
                {groups.map((g) => (
                  <td key={g.label}>{fn(g)}</td>
                ))}
                <td className="analyticsBenchmarkCell">{bench}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Campaign360View({ campaign, current, previous, cohort, onClose }) {
  const keys = new Set(campaign.keys)
  const rows = current.filter((r) => keys.has(r.templateKey))
  const prevRows = previous.filter((r) => keys.has(r.templateKey))
  const agg = sumRows(rows)
  const prev = sumRows(prevRows)
  const metrics = metricsFromAgg(agg)
  const prevMetrics = metricsFromAgg(prev)
  const peerGroups = cohort.filter((g) => g.label !== campaign.name)
  const peerBenchmark = buildCampaignBenchmark(peerGroups.length ? peerGroups : cohort)
  const status = campaignStatus({ ...metrics, benchmark: peerBenchmark })
  const score = campaignPerformanceScore(metrics, peerBenchmark)
  const trend = buildKpiTrend(rows, false)
  const regions = metricGroups(rows, 'region', 'region')
  const channels = metricGroups(rows, 'channel', 'channel')
  const templates = metricGroups(rows, 'templateKey', 'templateName')
  const insights = buildCampaign360Insights(
    campaign.name,
    metrics,
    prevMetrics,
    peerBenchmark,
    regions,
    templates,
  )

  return (
    <>
      <div className="analyticsDrillHeader">
        <button type="button" className="analyticsBackButton no-print" onClick={onClose}>
          <ArrowLeftIcon /> Campaigns
        </button>
        <div className="analyticsDrillTitle">
          <div
            className="analyticsCampaignDotLarge"
            style={{ background: campaign.color || C.blue }}
          />
          <div>
            <span className="analyticsIntelEyebrow">CAMPAIGN 360°</span>
            <h2>{campaign.name}</h2>
            <p>
              {campaign.templateCount || campaign.keys.length} assigned templates · current scope
            </p>
          </div>
        </div>
        <div className="analyticsDrillScore">
          <span>Performance score</span>
          <strong>{score}</strong>
          <StatusBadge {...status} />
        </div>
      </div>

      <div className="analyticsKpiGrid analyticsDrillKpis">
        <Kpi
          ico={<MailIcon />}
          label="Sent"
          val={fmt(agg.sent)}
          clr={C.blue}
          delta={relDelta(agg.sent, prev.sent)}
          goodUp
          spark={trend}
          sparkKey="sent"
          accent="blue"
        />
        <Kpi
          ico={<CheckIcon />}
          label="Delivery"
          val={`${metrics.delivery.toFixed(1)}%`}
          clr={C.greenTxt}
          delta={ppDelta(metrics.delivery, prevMetrics.delivery)}
          goodUp
          spark={trend}
          sparkKey="deliveryRate"
          accent="green"
        />
        <Kpi
          ico={<EyeIcon />}
          label="Open rate"
          val={`${metrics.open.toFixed(1)}%`}
          clr={C.green}
          delta={ppDelta(metrics.open, prevMetrics.open)}
          goodUp
          spark={trend}
          sparkKey="openRate"
          accent="lime"
        />
        <Kpi
          ico={<PointerIcon />}
          label="CTR"
          val={`${metrics.ctr.toFixed(1)}%`}
          clr={C.purple}
          delta={ppDelta(metrics.ctr, prevMetrics.ctr)}
          goodUp
          spark={trend}
          sparkKey="ctr"
          accent="purple"
        />
        <Kpi
          ico={<TargetIcon />}
          label="CTOR"
          val={`${metrics.ctor.toFixed(1)}%`}
          clr={C.purple}
          delta={ppDelta(metrics.ctor, prevMetrics.ctor)}
          goodUp
          spark={trend}
          sparkKey="ctor"
          accent="violet"
        />
        <Kpi
          ico={<BounceIcon />}
          label="Bounce"
          val={`${metrics.bounce.toFixed(1)}%`}
          clr={metrics.bounce > 5 ? C.red : C.blue}
          delta={ppDelta(metrics.bounce, prevMetrics.bounce)}
          goodUp={false}
          spark={trend}
          sparkKey="bounceRate"
          accent="red"
        />
      </div>

      <Card
        title="Campaign vs peer benchmark"
        sub="Peer benchmark excludes this campaign and uses the median of the remaining comparable campaigns"
      >
        <div className="analyticsCampaignVsBenchmark">
          {[
            ['Open rate', metrics.open, peerBenchmark.open, 'green'],
            ['CTR', metrics.ctr, peerBenchmark.ctr, 'purple'],
            ['CTOR', metrics.ctor, peerBenchmark.ctor, 'blue'],
            ['Delivery', metrics.delivery, peerBenchmark.delivery, 'green'],
          ].map(([label, value, bench, tone]) => (
            <div className={`analyticsVsMetric ${tone}`} key={label}>
              <span>{label}</span>
              <strong>{value.toFixed(1)}%</strong>
              <MetricDelta value={value - bench} />
              <small>peer median {bench.toFixed(1)}%</small>
            </div>
          ))}
        </div>
      </Card>

      {insights.length > 0 && (
        <div className="analyticsInsightGrid">
          {insights.map((item, i) => (
            <InsightCard key={`${item.title}-${i}`} {...item} />
          ))}
        </div>
      )}

      <Card
        title="Performance timeline"
        sub="Daily rates for this campaign inside the selected global scope"
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trend} margin={{ top: 12, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 4" stroke={C.border} />
            <XAxis dataKey="d" tick={{ fontSize: 10, fill: C.mid }} />
            <YAxis tick={{ fontSize: 10, fill: C.mid }} unit="%" />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="openRate"
              name="Open %"
              stroke={C.green}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="ctr"
              name="CTR %"
              stroke={C.purple}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="deliveryRate"
              name="Delivery %"
              stroke={C.blue}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <div className="analyticsTwoCol analyticsDrillBreakdowns">
        <Card title="Region contribution" sub="Performance and click contribution by region">
          <IntelligenceLeaderboard groups={regions} label="Region" />
        </Card>
        <Card title="Channel contribution" sub="Email / push mix for this campaign">
          <IntelligenceLeaderboard groups={channels} label="Channel" />
        </Card>
      </div>

      <Card
        title="Template contribution"
        sub="Which assigned templates are creating the campaign result"
      >
        <IntelligenceLeaderboard groups={templates} label="Template" limit={15} />
      </Card>
    </>
  )
}

function IntelligenceLeaderboard({ groups, label, limit = 10 }) {
  const sorted = [...groups].sort((a, b) => b.uniqueClicks - a.uniqueClicks).slice(0, limit)
  return (
    <div className="analyticsTableWrap">
      <table className="analyticsDataTable">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Sent</th>
            <th>Open</th>
            <th>CTR</th>
            <th>CTOR</th>
            <th>Clicks</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="analyticsTableEmpty">
                No data
              </td>
            </tr>
          )}
          {sorted.map((g) => (
            <tr key={g.label}>
              <td>
                <strong>{g.label}</strong>
              </td>
              <td>{fmt(g.sent)}</td>
              <td>{g.open.toFixed(1)}%</td>
              <td>{g.ctr.toFixed(1)}%</td>
              <td>{g.ctor.toFixed(1)}%</td>
              <td>{fmt(g.uniqueClicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TemplatesTab({ current, tplMap, focusTemplate = '' }) {
  const [mode, setMode] = useState('theme')
  const [section, setSection] = useState('performance')

  useEffect(() => {
    if (focusTemplate) setSection('library')
  }, [focusTemplate])

  const groups = useMemo(() => {
    const keyFn = (r) => {
      const name =
        (tplMap[r.templateKey] && tplMap[r.templateKey].name) ||
        r.templateName ||
        r.templateKey ||
        ''

      if (mode === 'template') return r.templateName || r.templateKey || '—'
      if (mode === 'family')
        return (tplMap[r.templateKey] && tplMap[r.templateKey].family) || familyOfName(name)
      return themeOf(name)
    }

    const map = new Map()
    for (const r of current) {
      const k = keyFn(r)
      if (!map.has(k)) map.set(k, { label: k, rows: [] })
      map.get(k).rows.push(r)
    }

    const arr = [...map.values()].map((g) => ({
      label: g.label,
      ...sumRows(g.rows),
    }))

    if (mode === 'template') {
      arr.sort((a, b) => pctNum(b.uniqueOpens, b.delivered) - pctNum(a.uniqueOpens, a.delivered))
    } else {
      arr.sort((a, b) => b.sent - a.sent)
    }

    return arr
  }, [current, tplMap, mode])

  const templateKeys = [...new Set(current.map((r) => r.templateKey).filter(Boolean))]
  const mappedCount = templateKeys.filter((key) => tplMap[key]).length
  const unmappedKeys = templateKeys.filter((key) => !tplMap[key])
  const coverage = templateKeys.length ? (mappedCount / templateKeys.length) * 100 : 100

  const templateGroups = useMemo(() => {
    const map = new Map()
    for (const r of current) {
      const key = r.templateKey || r.templateName || '—'
      if (!map.has(key)) {
        map.set(key, {
          label: (tplMap[r.templateKey] && tplMap[r.templateKey].name) || r.templateName || key,
          key,
          rows: [],
        })
      }
      map.get(key).rows.push(r)
    }
    return [...map.values()].map((g) => ({
      label: g.label,
      key: g.key,
      mapped: Boolean(tplMap[g.key]),
      ...sumRows(g.rows),
    }))
  }, [current, tplMap])

  const meaningful = templateGroups.filter((g) => g.delivered >= 100)
  const ranked = meaningful.length ? meaningful : templateGroups.filter((g) => g.delivered > 0)
  const topOpen = [...ranked].sort(
    (a, b) => pctNum(b.uniqueOpens, b.delivered) - pctNum(a.uniqueOpens, a.delivered),
  )[0]
  const topCtr = [...ranked].sort(
    (a, b) => pctNum(b.uniqueClicks, b.delivered) - pctNum(a.uniqueClicks, a.delivered),
  )[0]
  const mostUsed = [...templateGroups].sort((a, b) => b.sent - a.sent)[0]
  const overall = sumRows(current)
  const openBenchmark = pctNum(overall.uniqueOpens, overall.delivered)
  const underperformer = [...ranked]
    .filter((g) => g.sent >= Math.max(100, (mostUsed?.sent || 0) * 0.2))
    .sort((a, b) => pctNum(a.uniqueOpens, a.delivered) - pctNum(b.uniqueOpens, b.delivered))[0]

  const titles = {
    theme: 'Theme leaderboard',
    family: 'Family leaderboard',
    template: 'Template leaderboard',
  }

  const subs = {
    theme: 'Broad keyword themes · highest volume first',
    family: 'Templates grouped by name prefix · highest volume first',
    template: 'Individual templates · sorted by open rate',
  }

  const sectionNav = (
    <div className="analyticsSectionBar no-print">
      <div>
        <span>Template workspace</span>
        <small>Performance, fatigue and reusable library</small>
      </div>
      <div className="analyticsSectionSwitch">
        {[
          ['performance', 'Performance'],
          ['fatigue', 'Fatigue'],
          ['library', 'Library'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={section === value ? 'active' : ''}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )

  if (section === 'fatigue') {
    return (
      <>
        {sectionNav}
        <TemplateFatigueView current={current} tplMap={tplMap} />
      </>
    )
  }

  if (section === 'library') {
    return (
      <>
        {sectionNav}
        <TemplateLibrary current={current} tplMap={tplMap} initialQuery={focusTemplate} />
      </>
    )
  }

  return (
    <>
      {sectionNav}
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">CONTENT INTELLIGENCE</span>
          <h2>Which content actually works?</h2>
          <p>
            Compare themes, template families and individual templates while keeping mapping
            coverage visible.
          </p>
        </div>
        <div className={`analyticsCoveragePill ${coverage < 90 ? 'warning' : ''}`}>
          <span>Template mapping coverage</span>
          <strong>{coverage.toFixed(0)}%</strong>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Best open rate"
          value={topOpen ? `${pctNum(topOpen.uniqueOpens, topOpen.delivered).toFixed(1)}%` : '—'}
          detail={topOpen?.label || 'No template data'}
          tone="green"
          icon={<EyeIcon />}
        />
        <MiniStat
          label="Best CTR"
          value={topCtr ? `${pctNum(topCtr.uniqueClicks, topCtr.delivered).toFixed(1)}%` : '—'}
          detail={topCtr?.label || 'No template data'}
          tone="purple"
          icon={<PointerIcon />}
        />
        <MiniStat
          label="Most used"
          value={mostUsed ? fmt(mostUsed.sent) : '—'}
          detail={mostUsed?.label || 'No template data'}
          tone="blue"
          icon={<SendIcon />}
        />
        <MiniStat
          label="Mapping gaps"
          value={fmt(unmappedKeys.length)}
          detail={
            unmappedKeys.length ? 'Unmapped canonical template keys' : 'All active keys mapped'
          }
          tone={unmappedKeys.length ? 'amber' : 'green'}
          icon={<TemplateIcon />}
        />
      </div>

      {(unmappedKeys.length > 0 ||
        (underperformer &&
          pctNum(underperformer.uniqueOpens, underperformer.delivered) < openBenchmark - 5)) && (
        <div className="analyticsInsightGrid">
          {unmappedKeys.length > 0 && (
            <InsightCard
              tone="amber"
              icon={<AlertIcon />}
              title={`${unmappedKeys.length} unmapped template${unmappedKeys.length === 1 ? '' : 's'}`}
              text={`Reporting can fragment until these keys are mapped: ${unmappedKeys.slice(0, 3).join(', ')}${unmappedKeys.length > 3 ? '…' : ''}`}
            />
          )}
          {underperformer &&
            pctNum(underperformer.uniqueOpens, underperformer.delivered) < openBenchmark - 5 && (
              <InsightCard
                tone="red"
                icon={<TrendIcon />}
                title="High-volume underperformer"
                text={`${underperformer.label} is ${Math.abs(pctNum(underperformer.uniqueOpens, underperformer.delivered) - openBenchmark).toFixed(1)}pp below the current open-rate benchmark.`}
              />
            )}
        </div>
      )}

      <Card title={titles[mode]} sub={subs[mode]}>
        <div className="analyticsSegmentRow">
          {[
            ['theme', 'By theme'],
            ['family', 'By family'],
            ['template', 'By template'],
          ].map(([v, l]) => (
            <button
              type="button"
              key={v}
              onClick={() => setMode(v)}
              className={`analyticsSegmentButton ${mode === v ? 'active' : ''}`}
            >
              {l}
            </button>
          ))}
          <span className="analyticsSegmentMeta">{groups.length} rows</span>
        </div>
        <LeaderTable groups={groups} />
      </Card>
    </>
  )
}

function TemplateFatigueView({ current, tplMap }) {
  const fatigue = useMemo(() => buildTemplateFatigue(current, tplMap), [current, tplMap])
  const eligible = fatigue.filter((item) => item.status !== 'insufficient')
  const flagged = eligible.filter((item) => item.status === 'fatigued' || item.status === 'watch')
  const fatigued = eligible.filter((item) => item.status === 'fatigued')
  const stable = eligible.filter((item) => item.status === 'stable')
  const steepest = [...eligible].sort((a, b) => b.fatigueScore - a.fatigueScore)[0]

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">TEMPLATE FATIGUE</span>
          <h2>Is repeated use reducing engagement?</h2>
          <p>
            Each use is a distinct active send day for a canonical template. Recent weighted
            performance is compared with the preceding uses, so low-volume daily fragments do not
            distort the signal.
          </p>
        </div>
        <div className={`analyticsCoveragePill ${fatigued.length ? 'warning' : ''}`}>
          <span>Templates to review</span>
          <strong>{flagged.length}</strong>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Fatigue detected"
          value={fmt(fatigued.length)}
          detail="Material repeated-use decline"
          tone={fatigued.length ? 'red' : 'green'}
          icon={<TrendIcon />}
        />
        <MiniStat
          label="Watch list"
          value={fmt(flagged.length - fatigued.length)}
          detail="Early deterioration signal"
          tone={flagged.length > fatigued.length ? 'amber' : 'green'}
          icon={<AlertIcon />}
        />
        <MiniStat
          label="Stable templates"
          value={fmt(stable.length)}
          detail="No material recent decline"
          tone="green"
          icon={<ShieldIcon />}
        />
        <MiniStat
          label="Largest fatigue score"
          value={steepest ? `${steepest.fatigueScore}/100` : '—'}
          detail={steepest?.label || 'Not enough repeated sends'}
          tone={steepest?.status === 'fatigued' ? 'red' : 'blue'}
          icon={<TemplateIcon />}
        />
      </div>

      {flagged.length > 0 && (
        <div className="analyticsInsightGrid">
          {flagged.slice(0, 4).map((item) => (
            <InsightCard
              key={item.key}
              tone={item.status === 'fatigued' ? 'red' : 'amber'}
              icon={<TrendIcon />}
              title={`${item.label} · ${item.status === 'fatigued' ? 'fatigue detected' : 'watch'}`}
              text={`${item.useCount} active send days. Recent open rate is ${Math.abs(item.openDelta).toFixed(1)}pp ${item.openDelta < 0 ? 'below' : 'above'} the preceding-use baseline and CTR is ${Math.abs(item.ctrDelta).toFixed(1)}pp ${item.ctrDelta < 0 ? 'below' : 'above'}.`}
            />
          ))}
        </div>
      )}

      <Card
        title="Repeated-use trend"
        sub="Requires at least four active send days · six or more gives the strongest recent-vs-prior comparison"
      >
        <div className="analyticsTableWrap">
          <table className="analyticsDataTable analyticsFatigueTable">
            <thead>
              <tr>
                <th>Template</th>
                <th>Status</th>
                <th>Uses</th>
                <th>Last used</th>
                <th>Recent open</th>
                <th>Δ open</th>
                <th>Recent CTR</th>
                <th>Δ CTR</th>
                <th>Trend</th>
              </tr>
            </thead>
            <tbody>
              {fatigue.length === 0 && (
                <tr>
                  <td colSpan={9} className="analyticsTableEmpty">
                    No template activity
                  </td>
                </tr>
              )}
              {fatigue.map((item) => (
                <tr key={item.key}>
                  <td>
                    <strong>{item.label}</strong>
                    <span className="analyticsInlineMeta">{item.family}</span>
                  </td>
                  <td>
                    <StatusBadge
                      label={
                        item.status === 'fatigued'
                          ? 'Fatigued'
                          : item.status === 'watch'
                            ? 'Watch'
                            : item.status === 'stable'
                              ? 'Stable'
                              : 'Need more sends'
                      }
                      tone={
                        item.status === 'fatigued'
                          ? 'bad'
                          : item.status === 'watch'
                            ? 'warning'
                            : item.status === 'stable'
                              ? 'good'
                              : 'neutral'
                      }
                    />
                  </td>
                  <td>{item.useCount}</td>
                  <td>{item.lastUsed ? formatShortDate(item.lastUsed) : '—'}</td>
                  <td>{item.recentOpen != null ? `${item.recentOpen.toFixed(1)}%` : '—'}</td>
                  <td>
                    <MetricDelta value={item.openDelta} />
                  </td>
                  <td>{item.recentCtr != null ? `${item.recentCtr.toFixed(1)}%` : '—'}</td>
                  <td>
                    <MetricDelta value={item.ctrDelta} />
                  </td>
                  <td>
                    <div className="analyticsFatigueSpark">
                      {item.points.length > 1 ? (
                        <ResponsiveContainer width="100%" height={42}>
                          <LineChart
                            data={item.points}
                            margin={{ top: 4, right: 2, left: 2, bottom: 2 }}
                          >
                            <Line
                              type="monotone"
                              dataKey="open"
                              stroke={C.green}
                              strokeWidth={1.7}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="ctr"
                              stroke={C.purple}
                              strokeWidth={1.5}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="analyticsMethodNote">
        <AlertIcon />
        <span>
          Fatigue is a directional signal, not proof of causation. Audience mix, offer strength,
          seasonality and send timing can also move engagement. Review the flagged templates before
          deciding to retire or redesign them.
        </span>
      </div>
    </>
  )
}

function TemplateLibrary({ current, tplMap, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [theme, setTheme] = useState('All')
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
  }, [initialQuery])
  const entries = useMemo(() => buildTemplateLibraryEntries(current, tplMap), [current, tplMap])
  const themes = useMemo(() => [...new Set(entries.map((item) => item.theme))].sort(), [entries])
  const filtered = entries.filter((item) => {
    const q = query.trim().toLowerCase()
    return (
      (theme === 'All' || item.theme === theme) &&
      (!q || `${item.label} ${item.key} ${item.family} ${item.theme}`.toLowerCase().includes(q))
    )
  })
  const active = entries.filter((item) => item.sent > 0).length
  const mapped = entries.filter((item) => item.mapped).length

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">EMAIL TEMPLATE LIBRARY</span>
          <h2>One searchable view of reusable content</h2>
          <p>
            The library combines canonical mappings with the selected-period performance layer. It
            does not invent screenshots because the current template mapping schema does not store
            rendered creative assets.
          </p>
        </div>
        <div className="analyticsCoveragePill">
          <span>Canonical templates</span>
          <strong>{entries.length}</strong>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Active in period"
          value={fmt(active)}
          detail="Templates with send activity"
          tone="green"
          icon={<SendIcon />}
        />
        <MiniStat
          label="Mapped"
          value={fmt(mapped)}
          detail={`${entries.length ? ((mapped / entries.length) * 100).toFixed(0) : 100}% library coverage`}
          tone={mapped === entries.length ? 'green' : 'amber'}
          icon={<CheckIcon />}
        />
        <MiniStat
          label="Themes"
          value={fmt(themes.length)}
          detail="Derived content categories"
          tone="blue"
          icon={<TemplateIcon />}
        />
        <MiniStat
          label="Inactive in scope"
          value={fmt(entries.length - active)}
          detail="Mapped but no sends in selected period"
          tone="purple"
          icon={<ClockIcon />}
        />
      </div>

      <div className="analyticsLibraryToolbar no-print">
        <div className="analyticsLibrarySearch">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, key, family or theme…"
          />
        </div>
        <label className="analyticsLibrarySelect">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="All">All themes</option>
            {themes.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <span className="analyticsLibraryCount">{filtered.length} shown</span>
      </div>

      <div className="analyticsTemplateLibraryGrid">
        {filtered.length === 0 && <Empty>No templates match the current search.</Empty>}
        {filtered.map((item) => (
          <article className="analyticsTemplateLibraryCard" key={item.key}>
            <div className="analyticsTemplateLibraryVisual">
              <span>{templateInitials(item.label)}</span>
              <small>{item.theme}</small>
            </div>
            <div className="analyticsTemplateLibraryBody">
              <div className="analyticsTemplateLibraryTop">
                <StatusBadge
                  label={item.mapped ? 'Mapped' : 'Unmapped'}
                  tone={item.mapped ? 'good' : 'warning'}
                />
                <span>{item.lastUsed ? formatShortDate(item.lastUsed) : 'Not used'}</span>
              </div>
              <h3>{item.label}</h3>
              <p>{item.family}</p>
              <code>{item.key}</code>
              <div className="analyticsTemplateLibraryMetrics">
                <div>
                  <span>Sent</span>
                  <strong>{fmt(item.sent)}</strong>
                </div>
                <div>
                  <span>Open</span>
                  <strong>{item.delivered ? `${item.open.toFixed(1)}%` : '—'}</strong>
                </div>
                <div>
                  <span>CTR</span>
                  <strong>{item.delivered ? `${item.ctr.toFixed(1)}%` : '—'}</strong>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function AudienceIntelligence({ current, previous }) {
  const [mode, setMode] = useState('region')

  const regionGroups = useMemo(() => metricGroups(current, 'region', 'region'), [current])
  const prevRegions = useMemo(
    () => new Map(metricGroups(previous, 'region', 'region').map((g) => [g.label, g])),
    [previous],
  )
  const languageGroups = useMemo(() => groupByDerived(current, languageOfRow), [current])
  const prevLanguages = useMemo(
    () => new Map(groupByDerived(previous, languageOfRow).map((g) => [g.label, g])),
    [previous],
  )

  const groups = mode === 'region' ? regionGroups : languageGroups
  const prevMap = mode === 'region' ? prevRegions : prevLanguages
  const knownLanguages = languageGroups.filter((g) => g.label !== 'Unknown')
  const languageSent = languageGroups.reduce((n, g) => n + g.sent, 0)
  const identifiedSent = knownLanguages.reduce((n, g) => n + g.sent, 0)
  const languageCoverage = languageSent ? (identifiedSent / languageSent) * 100 : 100
  const benchmark = buildMetricGroupBenchmark(mode === 'language' ? knownLanguages : groups)

  const enriched = groups
    .map((g) => {
      const prev = prevMap.get(g.label)
      return {
        ...g,
        openDelta: prev ? g.open - prev.open : null,
        ctrDelta: prev ? g.ctr - prev.ctr : null,
      }
    })
    .sort((a, b) => b.sent - a.sent)

  const eligible = enriched.filter((g) => g.label !== 'Unknown' && g.delivered >= 100)
  const bestOpen = [...eligible].sort((a, b) => b.open - a.open)[0]
  const bestCtr = [...eligible].sort((a, b) => b.ctr - a.ctr)[0]
  const biggest = [...eligible].sort((a, b) => b.sent - a.sent)[0]
  const weakest = [...eligible].sort((a, b) => a.open - b.open)[0]

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">AUDIENCE INTELLIGENCE</span>
          <h2>Where is performance coming from?</h2>
          <p>
            Compare regions and identifiable languages with medians from the current filtered scope.
            Language is only classified when the reporting row contains an explicit language signal.
          </p>
        </div>
        <div className="analyticsAudienceMode no-print">
          <button
            type="button"
            className={mode === 'region' ? 'active' : ''}
            onClick={() => setMode('region')}
          >
            Regions
          </button>
          <button
            type="button"
            className={mode === 'language' ? 'active' : ''}
            onClick={() => setMode('language')}
          >
            Languages
          </button>
        </div>
      </div>

      {mode === 'language' && languageCoverage < 95 && (
        <div className="analyticsCoverageNotice">
          <AlertIcon />
          <div>
            <strong>
              {languageCoverage.toFixed(0)}% of send volume has an identifiable language signal
            </strong>
            <span>
              Unknown rows stay visible and are excluded from language benchmarks rather than
              guessed from region.
            </span>
          </div>
        </div>
      )}

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label={`Best ${mode === 'region' ? 'region' : 'language'} · open`}
          value={bestOpen ? `${bestOpen.open.toFixed(1)}%` : '—'}
          detail={bestOpen?.label || 'No eligible data'}
          tone="green"
          icon={<EyeIcon />}
        />
        <MiniStat
          label={`Best ${mode === 'region' ? 'region' : 'language'} · CTR`}
          value={bestCtr ? `${bestCtr.ctr.toFixed(1)}%` : '—'}
          detail={bestCtr?.label || 'No eligible data'}
          tone="purple"
          icon={<PointerIcon />}
        />
        <MiniStat
          label="Largest audience"
          value={biggest ? fmt(biggest.sent) : '—'}
          detail={biggest?.label || 'No eligible data'}
          tone="blue"
          icon={<UsersIcon />}
        />
        <MiniStat
          label="Watchlist"
          value={weakest ? `${weakest.open.toFixed(1)}%` : '—'}
          detail={weakest ? `${weakest.label} · lowest open rate` : 'No eligible data'}
          tone={weakest && weakest.open < benchmark.open - 3 ? 'amber' : 'green'}
          icon={<AlertIcon />}
        />
      </div>

      <Card
        title={`${mode === 'region' ? 'Region' : 'Language'} intelligence leaderboard`}
        sub={`Current performance · median benchmark ${benchmark.open.toFixed(1)}% open / ${benchmark.ctr.toFixed(1)}% CTR`}
      >
        <div className="analyticsTableWrap">
          <table className="analyticsDataTable analyticsAudienceTable">
            <thead>
              <tr>
                <th>{mode === 'region' ? 'Region' : 'Language'}</th>
                <th>Sent</th>
                <th>Delivery</th>
                <th>Open</th>
                <th>vs median</th>
                <th>vs prev.</th>
                <th>CTR</th>
                <th>CTOR</th>
                <th>Share of clicks</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 && (
                <tr>
                  <td colSpan={9} className="analyticsTableEmpty">
                    No data
                  </td>
                </tr>
              )}
              {enriched.map((g) => {
                const allClicks = enriched.reduce((n, x) => n + x.uniqueClicks, 0)
                return (
                  <tr key={g.label} className={g.label === 'Unknown' ? 'analyticsUnknownRow' : ''}>
                    <td>
                      <strong>{g.label}</strong>
                      {g.label === 'Unknown' && (
                        <span className="analyticsInlineMeta">unclassified</span>
                      )}
                    </td>
                    <td>{fmt(g.sent)}</td>
                    <td>{g.delivery.toFixed(1)}%</td>
                    <td>
                      <strong style={{ color: rateColor(g.open) }}>{g.open.toFixed(1)}%</strong>
                    </td>
                    <td>
                      <MetricDelta value={g.label === 'Unknown' ? null : g.open - benchmark.open} />
                    </td>
                    <td>
                      <MetricDelta value={g.openDelta} />
                    </td>
                    <td>{g.ctr.toFixed(1)}%</td>
                    <td>{g.ctor.toFixed(1)}%</td>
                    <td>{allClicks ? ((g.uniqueClicks / allClicks) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="analyticsTwoCol">
        <Card
          title="Engagement distribution"
          sub={`${mode === 'region' ? 'Regions' : 'Languages'} ranked by unique clicks`}
        >
          <BreakdownBars
            data={[...enriched]
              .sort((a, b) => b.uniqueClicks - a.uniqueClicks)
              .slice(0, 8)
              .map((g) => ({ name: g.label, open: +g.open.toFixed(1), ctr: +g.ctr.toFixed(1) }))}
          />
        </Card>
        <Card
          title="Performance outliers"
          sub="Groups materially above or below the median benchmark"
        >
          <div className="analyticsOutlierList">
            {buildAudienceOutliers(
              enriched.filter((g) => g.label !== 'Unknown'),
              benchmark,
            ).map((item) => (
              <div className={`analyticsOutlierItem ${item.tone}`} key={item.label}>
                <span className="analyticsOutlierDot" />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.text}</span>
                </div>
              </div>
            ))}
            {buildAudienceOutliers(
              enriched.filter((g) => g.label !== 'Unknown'),
              benchmark,
            ).length === 0 && <Empty>No material outliers detected.</Empty>}
          </div>
        </Card>
      </div>
    </>
  )
}

function IntelligenceFeed({ items }) {
  return (
    <Card
      title="Intelligence feed"
      sub="Prioritized signals from campaigns, deliverability, audience and data quality"
      className="analyticsIntelFeedCard"
    >
      <div className="analyticsIntelFeed">
        {items.map((item, i) => (
          <div className={`analyticsIntelFeedItem ${item.severity}`} key={`${item.title}-${i}`}>
            <div className="analyticsIntelFeedSeverity">
              {item.severity === 'critical' ? '!' : item.severity === 'warning' ? '!' : '✓'}
            </div>
            <div className="analyticsIntelFeedBody">
              <div className="analyticsIntelFeedMeta">
                <span>{item.category}</span>
                <small>{item.priority}</small>
              </div>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
              {item.action && (
                <div className="analyticsIntelFeedAction">Recommended: {item.action}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AlertCenter({ current, previous, scopeCurrent, campaigns, tplMap }) {
  const [rules, setRules] = useState(DEFAULT_ALERT_RULES)
  const [rulesReady, setRulesReady] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ALERT_RULES_KEY)
      if (raw) setRules({ ...DEFAULT_ALERT_RULES, ...JSON.parse(raw) })
    } catch {}
    setRulesReady(true)
  }, [])

  useEffect(() => {
    if (!rulesReady) return
    try {
      window.localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(rules))
      setSaved(true)
      const id = window.setTimeout(() => setSaved(false), 700)
      return () => window.clearTimeout(id)
    } catch {}
  }, [rules, rulesReady])

  const alerts = buildActiveAlerts({ current, previous, scopeCurrent, campaigns, tplMap, rules })
  const critical = alerts.filter((a) => a.severity === 'critical').length
  const warning = alerts.filter((a) => a.severity === 'warning').length

  const update = (key, value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    setRules((prev) => ({ ...prev, [key]: n }))
  }

  const ruleFields = [
    ['deliveryMin', 'Minimum delivery rate', '%', 'Alert when delivery drops below this level.'],
    [
      'openDropMax',
      'Open-rate drop',
      'pp',
      'Alert when open rate falls by at least this many percentage points vs previous period.',
    ],
    [
      'ctrDropMax',
      'CTR drop',
      'pp',
      'Alert when CTR falls by at least this many percentage points vs previous period.',
    ],
    [
      'complaintMax',
      'Maximum complaint rate',
      '%',
      'Alert when complaint rate reaches this threshold.',
    ],
    [
      'bounceMax',
      'Maximum bounce rate',
      '%',
      'Alert when combined hard + soft bounce reaches this threshold.',
    ],
    [
      'unsubscribeMax',
      'Maximum unsubscribe rate',
      '%',
      'Alert when unsubscribe rate reaches this threshold.',
    ],
    [
      'dataQualityMin',
      'Minimum data quality score',
      '/100',
      'Alert when data-quality score falls below this threshold.',
    ],
  ]

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">ALERT CENTER</span>
          <h2>Only surface what needs action.</h2>
          <p>
            Thresholds are configurable and evaluated against the current filtered reporting scope.
            Rules are saved in this browser for now; no notification is sent externally yet.
          </p>
        </div>
        <div
          className={`analyticsAlertCountPill ${critical ? 'critical' : warning ? 'warning' : 'healthy'}`}
        >
          <span>Active signals</span>
          <strong>{alerts.length}</strong>
          <small>
            {critical} critical · {warning} warning
          </small>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Critical"
          value={fmt(critical)}
          detail="Immediate review recommended"
          tone={critical ? 'red' : 'green'}
          icon={<AlertIcon />}
        />
        <MiniStat
          label="Warnings"
          value={fmt(warning)}
          detail="Monitor or investigate"
          tone={warning ? 'amber' : 'green'}
          icon={<BellIcon />}
        />
        <MiniStat
          label="Rules enabled"
          value={fmt(ruleFields.length)}
          detail="Current threshold rules"
          tone="blue"
          icon={<CheckIcon />}
        />
        <MiniStat
          label="Rule storage"
          value={saved ? 'Saved' : 'Local'}
          detail="Saved on this browser"
          tone="purple"
          icon={<ShieldIcon />}
        />
      </div>

      <Card title="Active alerts" sub="Sorted by severity and impact">
        {alerts.length ? (
          <div className="analyticsActiveAlertList">
            {alerts.map((alert, i) => (
              <div className={`analyticsActiveAlert ${alert.severity}`} key={`${alert.id}-${i}`}>
                <div className="analyticsActiveAlertIcon">
                  {alert.severity === 'critical' ? '!' : alert.severity === 'warning' ? '!' : 'i'}
                </div>
                <div className="analyticsActiveAlertBody">
                  <div>
                    <span>{alert.category}</span>
                    <small>{alert.metric}</small>
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.text}</p>
                </div>
                <div className="analyticsActiveAlertValue">{alert.value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="analyticsHealthyState">
            <ShieldIcon />
            <strong>No active alerts</strong>
            <span>All configured thresholds are currently inside range.</span>
          </div>
        )}
      </Card>

      <Card
        title="Alert rules"
        sub="Tune thresholds to match your internal operating standards"
        actions={
          <button
            type="button"
            className="analyticsTextButton no-print"
            onClick={() => setRules(DEFAULT_ALERT_RULES)}
          >
            Reset defaults
          </button>
        }
      >
        <div className="analyticsAlertRulesGrid">
          {ruleFields.map(([key, label, suffix, help]) => (
            <label className="analyticsAlertRule" key={key}>
              <span>{label}</span>
              <div className="analyticsAlertRuleInput">
                <input
                  type="number"
                  step="0.1"
                  value={rules[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
                <em>{suffix}</em>
              </div>
              <small>{help}</small>
            </label>
          ))}
        </div>
      </Card>
    </>
  )
}

function Channels({ current }) {
  const byChannel = groupBy(current, 'channel', 'channel')
  const bySource = groupBy(current, 'source', 'source')
  return (
    <div className="analyticsTwoCol">
      <Card title="Email vs Push" sub="Open & click rates by channel">
        <BreakdownBars
          data={byChannel.map((g) => ({
            name: g.label === 'email' ? 'Email' : 'Push',
            open: +pctNum(g.uniqueOpens, g.delivered).toFixed(1),
            ctr: +pctNum(g.uniqueClicks, g.delivered).toFixed(1),
          }))}
        />
      </Card>
      <Card title="By app / source" sub="Global vs China vs Email">
        <BreakdownBars
          data={bySource.map((g) => ({
            name: SOURCE_LABEL[g.label] || g.label,
            open: +pctNum(g.uniqueOpens, g.delivered).toFixed(1),
            ctr: +pctNum(g.uniqueClicks, g.delivered).toFixed(1),
          }))}
        />
      </Card>
    </div>
  )
}

function JourneyAnalytics({ journeys, error, days }) {
  const [region, setRegion] = useState('All')

  if (journeys === null) {
    return (
      <Card title="Journey analytics" sub="Loading journey tracking data…">
        <Spinner />
      </Card>
    )
  }

  if (error) return <Banner>{error}</Banner>

  const regions = [...new Set(journeys.map((j) => j.region).filter(Boolean))].sort()
  const anchor =
    journeys.reduce((max, j) => {
      const value = new Date(j.journeyStartedAt || j.journeyEndedAt || 0).getTime()
      return Number.isFinite(value) ? Math.max(max, value) : max
    }, 0) || Date.now()
  const cutoff = anchor - days * dayMs
  const scoped = journeys.filter((j) => {
    const started = new Date(j.journeyStartedAt || j.journeyEndedAt || 0).getTime()
    const inRange = !started || !Number.isFinite(started) || started >= cutoff
    return inRange && (region === 'All' || j.region === region)
  })

  const total = scoped.length
  const statusCounts = countValues(scoped, (j) => j.journeyStatus || 'Unknown')
  const started = scoped.filter((j) => j.journeyStartedAt).length
  const engagedPath = scoped.filter(
    (j) => j.path1Step || j.path1LastSendAt || j.path1ThankyouSentAt,
  ).length
  const nonEngagedPath = scoped.filter(
    (j) => j.path2Step || j.path2LastSendAt || j.day0SentAt,
  ).length
  const forms = scoped.filter((j) => j.formSubmitted).length
  const thankyou = scoped.filter((j) => j.path1ThankyouSentAt).length
  const ended = scoped.filter((j) => j.journeyEndedAt).length
  const completed = scoped.filter((j) =>
    ['Converted', 'Completed'].includes(j.journeyStatus),
  ).length
  const durations = scoped
    .filter((j) => j.journeyStartedAt && j.journeyEndedAt)
    .map(
      (j) =>
        (new Date(j.journeyEndedAt).getTime() - new Date(j.journeyStartedAt).getTime()) / dayMs,
    )
    .filter((v) => Number.isFinite(v) && v >= 0)
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null

  const regionGroups = regions
    .map((name) => {
      const rows = scoped.filter((j) => j.region === name)
      const converted = rows.filter((j) =>
        ['Converted', 'Completed'].includes(j.journeyStatus),
      ).length
      const submitted = rows.filter((j) => j.formSubmitted).length
      return {
        label: name,
        total: rows.length,
        active: rows.filter((j) => j.journeyStatus === 'Active').length,
        converted,
        submitted,
        conversion: pctNum(converted, rows.length),
        formRate: pctNum(submitted, rows.length),
      }
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total)

  const path1Steps = countValues(
    scoped.filter((j) => j.path1Step),
    (j) => j.path1Step,
  )
  const path2Steps = countValues(
    scoped.filter((j) => j.path2Step),
    (j) => j.path2Step,
  )
  const milestones = [
    ['Tracked records', total, 'All records in scope'],
    ['Journey started', started, 'Has journeyStartedAt'],
    ['Engaged path activity', engagedPath, 'Path 1 activity observed'],
    ['Non-engaged path activity', nonEngagedPath, 'Path 2 activity observed'],
    ['Form submitted', forms, 'formSubmitted = true'],
    ['Thank-you sent', thankyou, 'Path 1 thank-you timestamp'],
    ['Converted / completed', completed, 'Final status is Converted or Completed'],
  ]

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">JOURNEY ANALYTICS</span>
          <h2>How are users progressing through the tracked journey?</h2>
          <p>
            This view reads the existing JourneyTracking collection. Milestones are reported as
            observed signals rather than forced into a strict funnel because Path 1 and Path 2 are
            parallel journey branches.
          </p>
        </div>
        <label className="analyticsJourneyRegion no-print">
          <span>Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="All">All journey regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Tracked"
          value={fmt(total)}
          detail={`Last ${days} days by journey start`}
          tone="blue"
          icon={<UsersIcon />}
        />
        <MiniStat
          label="Form submissions"
          value={fmt(forms)}
          detail={`${pctNum(forms, total).toFixed(1)}% of tracked`}
          tone="green"
          icon={<CheckIcon />}
        />
        <MiniStat
          label="Converted / completed"
          value={fmt(completed)}
          detail={`${pctNum(completed, total).toFixed(1)}% of tracked`}
          tone="purple"
          icon={<TargetIcon />}
        />
        <MiniStat
          label="Avg. journey duration"
          value={avgDuration == null ? '—' : `${avgDuration.toFixed(1)}d`}
          detail={`${durations.length} ended journeys with duration`}
          tone="amber"
          icon={<ClockIcon />}
        />
      </div>

      <Card
        title="Journey status"
        sub="Current status distribution inside the selected journey scope"
      >
        <div className="analyticsJourneyStatusGrid">
          {['Active', 'Converted', 'Completed', 'Excluded', 'Unknown'].map((status) => {
            const value = statusCounts.get(status) || 0
            if (!value && status === 'Unknown') return null
            return (
              <div className={`analyticsJourneyStatus status-${status.toLowerCase()}`} key={status}>
                <span>{status}</span>
                <strong>{fmt(value)}</strong>
                <small>{pctNum(value, total).toFixed(1)}%</small>
              </div>
            )
          })}
        </div>
      </Card>

      <Card
        title="Observed journey milestones"
        sub="Parallel branch signals · percentages are relative to tracked records, not assumed sequential conversion"
      >
        <div className="analyticsJourneyMilestones">
          {milestones.map(([label, value, detail]) => (
            <div className="analyticsJourneyMilestone" key={label}>
              <div className="analyticsJourneyMilestoneTop">
                <div>
                  <strong>{label}</strong>
                  <span>{detail}</span>
                </div>
                <div>
                  <b>{fmt(value)}</b>
                  <small>{pctNum(value, total).toFixed(1)}%</small>
                </div>
              </div>
              <div className="analyticsJourneyTrack">
                <span style={{ width: `${Math.min(100, pctNum(value, total))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="analyticsTwoCol">
        <Card title="Engaged path steps" sub="Current Path 1 step values in JourneyTracking">
          <JourneyStepList counts={path1Steps} total={engagedPath} />
        </Card>
        <Card title="Non-engaged path steps" sub="Current Path 2 step values in JourneyTracking">
          <JourneyStepList counts={path2Steps} total={nonEngagedPath} />
        </Card>
      </div>

      <Card
        title="Regional journey performance"
        sub="Tracked records, form submissions and final Converted/Completed status by journey region"
      >
        <div className="analyticsTableWrap">
          <table className="analyticsDataTable">
            <thead>
              <tr>
                <th>Region</th>
                <th>Tracked</th>
                <th>Active</th>
                <th>Forms</th>
                <th>Form rate</th>
                <th>Converted / completed</th>
                <th>Final rate</th>
              </tr>
            </thead>
            <tbody>
              {regionGroups.length === 0 && (
                <tr>
                  <td colSpan={7} className="analyticsTableEmpty">
                    No journey data in scope
                  </td>
                </tr>
              )}
              {regionGroups.map((g) => (
                <tr key={g.label}>
                  <td>
                    <strong>{g.label}</strong>
                  </td>
                  <td>{fmt(g.total)}</td>
                  <td>{fmt(g.active)}</td>
                  <td>{fmt(g.submitted)}</td>
                  <td>{g.formRate.toFixed(1)}%</td>
                  <td>{fmt(g.converted)}</td>
                  <td>
                    <strong style={{ color: rateColor(g.conversion) }}>
                      {g.conversion.toFixed(1)}%
                    </strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="analyticsMethodNote">
        <AlertIcon />
        <span>
          Journey status and milestone fields come directly from JourneyTracking. This dashboard
          does not infer missing steps or assume that a form submission is required for every
          completion.
        </span>
      </div>
    </>
  )
}

function JourneyStepList({ counts, total }) {
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (!rows.length) return <Empty>No step values recorded.</Empty>
  return (
    <div className="analyticsJourneyStepList">
      {rows.map(([label, value]) => (
        <div key={label}>
          <div>
            <strong>{label}</strong>
            <span>
              {fmt(value)} · {pctNum(value, total).toFixed(1)}%
            </span>
          </div>
          <div className="analyticsJourneyTrack">
            <span style={{ width: `${Math.min(100, pctNum(value, total))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Deliverability({ current, agg, aggPrev, complaintRate, bounceRate, weekly }) {
  const trend = buildDeliverabilityTrend(current, weekly)
  const score = buildHealthScore(agg)
  const prevScore = buildHealthScore(aggPrev)
  const health = healthLabel(score)
  const deliveryRate = pctNum(agg.delivered, agg.sent)
  const unsubRate = pctNum(agg.unsubscribes, agg.delivered)
  const failedRate = pctNum(agg.failed, agg.sent)
  const alerts = buildDeliverabilityAlerts(agg)
  const regions = buildDeliverabilityRegions(current)
  const scoreDelta = score - prevScore

  return (
    <>
      <div className="analyticsHealthHero">
        <div className={`analyticsHealthScore analyticsHealthScore-${health.tone}`}>
          <div className="analyticsHealthRing" style={{ '--health': `${score * 3.6}deg` }}>
            <div>
              <strong>{score}</strong>
              <span>/ 100</span>
            </div>
          </div>
          <div className="analyticsHealthScoreCopy">
            <span>INTERNAL HEALTH SCORE</span>
            <h2>{health.label}</h2>
            <p>
              A directional score built from delivery, bounce, complaint, unsubscribe and failed
              delivery signals. It is not an inbox-placement score.
            </p>
            {Number.isFinite(scoreDelta) && Math.abs(scoreDelta) >= 1 && (
              <MetricDelta value={scoreDelta} suffix=" pts vs previous period" />
            )}
          </div>
        </div>

        <div className="analyticsHealthDimensions">
          <HealthDimension
            label="Delivery rate"
            value={deliveryRate}
            target="Target ≥ 98%"
            good={deliveryRate >= 98}
            max={100}
          />
          <HealthDimension
            label="Bounce rate"
            value={bounceRate}
            target="Keep < 5%"
            good={bounceRate < 5}
            max={10}
            inverse
          />
          <HealthDimension
            label="Complaint rate"
            value={complaintRate}
            target="Keep < 0.10%"
            good={complaintRate < 0.1}
            max={0.25}
            inverse
            digits={3}
          />
          <HealthDimension
            label="Unsubscribe rate"
            value={unsubRate}
            target="Monitor trend"
            good={unsubRate < 1}
            max={3}
            inverse
          />
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="analyticsInsightGrid">
          {alerts.map((item, i) => (
            <InsightCard key={`${item.title}-${i}`} {...item} />
          ))}
        </div>
      ) : (
        <div className="analyticsSuccessBanner">
          <ShieldIcon />
          <div>
            <strong>No high-risk deliverability signals detected</strong>
            <span>
              Current filtered data is inside the dashboard's configured warning thresholds.
            </span>
          </div>
        </div>
      )}

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Hard bounces"
          value={fmt(agg.hardBounces)}
          detail={`${pctNum(agg.hardBounces, agg.sent).toFixed(2)}% of sent`}
          tone={pctNum(agg.hardBounces, agg.sent) > 2 ? 'red' : 'green'}
          icon={<BounceIcon />}
        />
        <MiniStat
          label="Soft bounces"
          value={fmt(agg.softBounces)}
          detail={`${pctNum(agg.softBounces, agg.sent).toFixed(2)}% of sent`}
          tone={pctNum(agg.softBounces, agg.sent) > 3 ? 'amber' : 'blue'}
          icon={<BounceIcon />}
        />
        <MiniStat
          label="Complaints"
          value={fmt(agg.complaints)}
          detail={`${complaintRate.toFixed(3)}% of delivered`}
          tone={complaintRate >= 0.1 ? 'red' : 'green'}
          icon={<FlagIcon />}
        />
        <MiniStat
          label="Failed"
          value={fmt(agg.failed)}
          detail={`${failedRate.toFixed(2)}% of sent`}
          tone={failedRate > 2 ? 'red' : 'blue'}
          icon={<AlertIcon />}
        />
      </div>

      <Card
        title="Complaints & bounces over time"
        sub="Directional reputation signals · watch for sustained upward trends"
      >
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={trend} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: C.mid }} />
            <YAxis tick={{ fontSize: 11, fill: C.mid }} />
            <Tooltip content={<AnalyticsTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="complaints"
              stroke={C.red}
              strokeWidth={2}
              dot={false}
              name="Complaints"
            />
            <Line
              type="monotone"
              dataKey="bounces"
              stroke={C.amber}
              strokeWidth={2}
              dot={false}
              name="Bounces"
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card
        title="Regional health"
        sub="Sorted by internal health score · use this to locate where risk is concentrated"
      >
        <div className="analyticsTableWrap">
          <table className="analyticsDataTable">
            <thead>
              <tr>
                <th>Region</th>
                <th>Health</th>
                <th>Sent</th>
                <th>Delivery</th>
                <th>Bounce</th>
                <th>Complaints</th>
                <th>Unsub</th>
              </tr>
            </thead>
            <tbody>
              {regions.length === 0 && (
                <tr>
                  <td colSpan={7} className="analyticsTableEmpty">
                    No data
                  </td>
                </tr>
              )}
              {regions.map((r) => {
                const h = healthLabel(r.score)
                return (
                  <tr key={r.label}>
                    <td>
                      <strong>{r.label}</strong>
                    </td>
                    <td>
                      <StatusBadge label={`${r.score}/100 · ${h.label}`} tone={h.tone} />
                    </td>
                    <td>{fmt(r.sent)}</td>
                    <td>{r.delivery.toFixed(1)}%</td>
                    <td className={r.bounce >= 5 ? 'analyticsRiskText' : ''}>
                      {r.bounce.toFixed(2)}%
                    </td>
                    <td className={r.complaints >= 0.1 ? 'analyticsRiskText' : ''}>
                      {r.complaints.toFixed(3)}%
                    </td>
                    <td>{r.unsub.toFixed(2)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

function DataQuality({ current, tplMap, campaigns }) {
  const report = useMemo(
    () => analyzeDataQuality(current, tplMap, campaigns),
    [current, tplMap, campaigns],
  )
  const health = dataQualityLabel(report.score)

  return (
    <>
      <div className="analyticsQualityHero">
        <div>
          <span className="analyticsIntelEyebrow">DATA QUALITY CENTER</span>
          <h2>Can you trust the reporting layer?</h2>
          <p>
            These checks validate mapping coverage and basic rollup integrity inside the current
            filters. They flag reporting problems before they become misleading insights.
          </p>
        </div>
        <div className={`analyticsQualityScore analyticsQualityScore-${health.tone}`}>
          <strong>{report.score}</strong>
          <div>
            <span>QUALITY SCORE</span>
            <b>{health.label}</b>
          </div>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label="Rows checked"
          value={fmt(current.length)}
          detail="Daily rollup rows in current filters"
          tone="blue"
          icon={<CheckIcon />}
        />
        <MiniStat
          label="Mapped templates"
          value={`${report.mappingCoverage.toFixed(0)}%`}
          detail={`${report.mappedKeys} of ${report.templateKeys} canonical keys`}
          tone={report.mappingCoverage >= 95 ? 'green' : 'amber'}
          icon={<TemplateIcon />}
        />
        <MiniStat
          label="Integrity errors"
          value={fmt(report.integrityCount)}
          detail="Impossible or contradictory metric relationships"
          tone={report.integrityCount ? 'red' : 'green'}
          icon={<AlertIcon />}
        />
        <MiniStat
          label="Duplicate dimensions"
          value={fmt(report.duplicateCount)}
          detail="Repeated date/channel/source/template/region rows"
          tone={report.duplicateCount ? 'amber' : 'green'}
          icon={<DataQualityIcon />}
        />
      </div>

      {report.issues.length === 0 ? (
        <div className="analyticsSuccessBanner">
          <CheckIcon />
          <div>
            <strong>No data-quality issues detected</strong>
            <span>The selected rollup data passed all currently configured checks.</span>
          </div>
        </div>
      ) : (
        <div className="analyticsQualityIssueGrid">
          {report.issues.map((issue) => (
            <div
              className={`analyticsQualityIssue analyticsQualityIssue-${issue.tone}`}
              key={issue.id}
            >
              <div className="analyticsQualityIssueIcon">
                {issue.tone === 'red' ? (
                  <AlertIcon />
                ) : issue.tone === 'amber' ? (
                  <FlagIcon />
                ) : (
                  <CheckIcon />
                )}
              </div>
              <div className="analyticsQualityIssueCopy">
                <div className="analyticsQualityIssueTop">
                  <strong>{issue.title}</strong>
                  <span>{fmt(issue.count)}</span>
                </div>
                <p>{issue.text}</p>
                {issue.samples?.length > 0 && (
                  <div className="analyticsIssueSamples">
                    {issue.samples.slice(0, 5).map((sample) => (
                      <code key={sample}>{sample}</code>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="analyticsTwoCol analyticsQualityDetails">
        <Card
          title="Unmapped template keys"
          sub="Keys present in reporting but missing from Template Mappings"
        >
          {report.unmappedKeys.length ? (
            <div className="analyticsKeyList">
              {report.unmappedKeys.map((key) => (
                <code key={key}>{key}</code>
              ))}
            </div>
          ) : (
            <div className="analyticsQualityClean">
              <CheckIcon /> All active template keys are mapped.
            </div>
          )}
        </Card>

        <Card
          title="Campaign coverage"
          sub="Assigned campaign templates with no data in the selected period"
        >
          {report.orphanCampaignKeys.length ? (
            <div className="analyticsKeyList">
              {report.orphanCampaignKeys.slice(0, 20).map((key) => (
                <code key={key}>{key}</code>
              ))}
            </div>
          ) : (
            <div className="analyticsQualityClean">
              <CheckIcon /> All assigned campaign keys have data in this period.
            </div>
          )}
        </Card>
      </div>
    </>
  )
}

function sumRows(list) {
  const k = [
    'sent',
    'delivered',
    'uniqueOpens',
    'totalOpens',
    'uniqueClicks',
    'totalClicks',
    'hardBounces',
    'softBounces',
    'complaints',
    'unsubscribes',
    'failed',
  ]
  const out = Object.fromEntries(k.map((x) => [x, 0]))
  for (const r of list) for (const x of k) out[x] += r[x] || 0
  return out
}
function metricsFromAgg(a) {
  return {
    open: pctNum(a.uniqueOpens, a.delivered),
    ctr: pctNum(a.uniqueClicks, a.delivered),
    ctor: pctNum(a.uniqueClicks, a.uniqueOpens),
    delivery: pctNum(a.delivered, a.sent),
    complaints: pctNum(a.complaints, a.delivered),
    bounce: pctNum((a.hardBounces || 0) + (a.softBounces || 0), a.sent),
    unsub: pctNum(a.unsubscribes, a.delivered),
    failedRate: pctNum(a.failed, a.sent),
  }
}

function metricGroups(list, key, labelKey) {
  return groupBy(list, key, labelKey).map((g) => ({ ...g, ...metricsFromAgg(g) }))
}

function buildCampaignGroups(list, campaigns) {
  return campaigns.map((c) => {
    const keys = new Set(c.keys)
    const rows = list.filter((r) => keys.has(r.templateKey))
    const agg = sumRows(rows)
    return {
      id: c.id,
      label: c.name,
      color: c.color,
      keys: c.keys,
      templateCount: c.keys.length,
      rows,
      ...agg,
    }
  })
}

function enrichCampaignGroups(groups, prevByName = new Map(), benchmarkOverride = null) {
  const populated = groups.filter((g) => g.sent > 0)
  const provisional = populated.map((g) => {
    const prev = prevByName.get(g.label) || sumRows([])
    const prevMetrics = metricsFromAgg(prev)
    const metrics = metricsFromAgg(g)
    return {
      ...g,
      ...metrics,
      openDelta: metrics.open - prevMetrics.open,
      ctrDelta: metrics.ctr - prevMetrics.ctr,
      prevMetrics,
    }
  })
  const benchmark = benchmarkOverride || buildCampaignBenchmark(provisional)
  return provisional
    .map((g) => ({
      ...g,
      status: campaignStatus({ ...g, benchmark }),
    }))
    .sort((a, b) => b.open - a.open)
}

function quantile(values, q) {
  const arr = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!arr.length) return 0
  if (arr.length === 1) return arr[0]
  const pos = (arr.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base]
}

function metricStats(values) {
  const clean = values.filter(Number.isFinite)
  const q1 = quantile(clean, 0.25)
  const median = quantile(clean, 0.5)
  const q3 = quantile(clean, 0.75)
  const scaleMax = Math.max(q3 * 1.3, median * 1.4, 1)
  return {
    q1,
    median,
    q3,
    iqr: q3 - q1,
    q1Pct: Math.max(0, Math.min(100, (q1 / scaleMax) * 100)),
    medianPct: Math.max(0, Math.min(100, (median / scaleMax) * 100)),
    q3Pct: Math.max(0, Math.min(100, (q3 / scaleMax) * 100)),
  }
}

function buildCampaignBenchmark(groups) {
  const eligible = groups.filter((g) => g && g.delivered >= 100 && g.sent > 0)
  const source = eligible.length ? eligible : groups.filter((g) => g && g.sent > 0)
  const openStats = metricStats(source.map((g) => g.open ?? pctNum(g.uniqueOpens, g.delivered)))
  const ctrStats = metricStats(source.map((g) => g.ctr ?? pctNum(g.uniqueClicks, g.delivered)))
  const ctorStats = metricStats(source.map((g) => g.ctor ?? pctNum(g.uniqueClicks, g.uniqueOpens)))
  const deliveryStats = metricStats(source.map((g) => g.delivery ?? pctNum(g.delivered, g.sent)))
  const bounceStats = metricStats(
    source.map((g) => g.bounce ?? pctNum((g.hardBounces || 0) + (g.softBounces || 0), g.sent)),
  )
  const complaintStats = metricStats(
    source.map((g) => g.complaints ?? pctNum(g.complaints, g.delivered)),
  )
  return {
    count: source.length,
    open: openStats.median,
    ctr: ctrStats.median,
    ctor: ctorStats.median,
    delivery: deliveryStats.median,
    bounce: bounceStats.median,
    complaints: complaintStats.median,
    openStats,
    ctrStats,
    ctorStats,
    deliveryStats,
    bounceStats,
    complaintStats,
  }
}

function campaignStatus({ open, ctr, delivery, complaints, bounce, benchmark }) {
  if (complaints >= 0.1 || bounce >= 5 || delivery < 95) {
    return { label: 'Risk', tone: 'bad' }
  }

  const openBand = Math.max(2, (benchmark?.openStats?.iqr || 0) * 0.75)
  const ctrBand = Math.max(0.8, (benchmark?.ctrStats?.iqr || 0) * 0.75)
  const openBase = benchmark?.open || 0
  const ctrBase = benchmark?.ctr || 0

  if (open < openBase - openBand || ctr < ctrBase - ctrBand) {
    return { label: 'Underperforming', tone: 'warning' }
  }
  if (open > openBase + openBand || ctr > ctrBase + ctrBand) {
    return { label: 'Strong', tone: 'good' }
  }
  return { label: 'On benchmark', tone: 'neutral' }
}

function buildCampaignIntelligence(groups, benchmark) {
  const out = []
  if (!groups.length) return out

  const strongest = [...groups].sort((a, b) => b.open - a.open)[0]
  const strongThreshold = Math.max(2, (benchmark.openStats?.iqr || 0) * 0.6)
  if (strongest && strongest.open >= benchmark.open + strongThreshold) {
    out.push({
      tone: 'green',
      icon: <SparkleIcon />,
      title: `${strongest.label} is leading engagement`,
      text: `${strongest.open.toFixed(1)}% open rate, ${Math.abs(strongest.open - benchmark.open).toFixed(1)}pp above the comparable-campaign median.`,
    })
  }

  const falling = [...groups]
    .filter((g) => g.openDelta <= -3)
    .sort((a, b) => a.openDelta - b.openDelta)[0]
  if (falling) {
    out.push({
      tone: 'red',
      icon: <TrendIcon />,
      title: `${falling.label} lost momentum`,
      text: `Open rate is down ${Math.abs(falling.openDelta).toFixed(1)}pp versus the previous comparable period.`,
    })
  }

  const risky = groups.find((g) => g.complaints >= 0.1 || g.bounce >= 5 || g.delivery < 95)
  if (risky) {
    const reason =
      risky.complaints >= 0.1
        ? `${risky.complaints.toFixed(3)}% complaints`
        : risky.bounce >= 5
          ? `${risky.bounce.toFixed(1)}% bounce rate`
          : `${risky.delivery.toFixed(1)}% delivery rate`
    out.push({
      tone: 'amber',
      icon: <AlertIcon />,
      title: `${risky.label} needs a deliverability check`,
      text: `${reason} is outside the dashboard's configured healthy range.`,
    })
  }

  const efficient = [...groups].filter((g) => g.open > 0).sort((a, b) => b.ctor - a.ctor)[0]
  if (efficient && efficient.ctor >= Math.max(15, benchmark.ctor + 2)) {
    out.push({
      tone: 'purple',
      icon: <TargetIcon />,
      title: `${efficient.label} converts opens well`,
      text: `${efficient.ctor.toFixed(1)}% CTOR is ${(efficient.ctor - benchmark.ctor).toFixed(1)}pp above the comparable-campaign median.`,
    })
  }

  return out.slice(0, 4)
}

function campaignPerformanceScore(metrics, benchmark) {
  const relative = (value, base, scale) => (base ? (value - base) / scale : 0)
  let score = 75
  score += Math.max(-14, Math.min(14, relative(metrics.open, benchmark.open, 2.5) * 4))
  score += Math.max(-12, Math.min(12, relative(metrics.ctr, benchmark.ctr, 1.2) * 4))
  score += Math.max(-8, Math.min(8, relative(metrics.ctor, benchmark.ctor, 2) * 2))
  score += Math.max(-8, Math.min(8, relative(metrics.delivery, benchmark.delivery, 1.2) * 2))
  if (metrics.complaints >= 0.1) score -= 12
  if (metrics.bounce >= 5) score -= 10
  return Math.max(0, Math.min(100, Math.round(score)))
}

function buildCampaign360Insights(name, metrics, prev, benchmark, regions, templates) {
  const out = []
  const openDelta = metrics.open - prev.open
  const ctrDelta = metrics.ctr - prev.ctr
  if (prev.open > 0 && Math.abs(openDelta) >= 2) {
    out.push({
      tone: openDelta > 0 ? 'green' : 'red',
      icon: <EyeIcon />,
      title: `${name} ${openDelta > 0 ? 'gained' : 'lost'} open-rate momentum`,
      text: `${Math.abs(openDelta).toFixed(1)}pp ${openDelta > 0 ? 'above' : 'below'} the previous comparable period.`,
    })
  }
  if (prev.ctr > 0 && Math.abs(ctrDelta) >= 1) {
    out.push({
      tone: ctrDelta > 0 ? 'purple' : 'amber',
      icon: <PointerIcon />,
      title: `CTR ${ctrDelta > 0 ? 'improved' : 'declined'}`,
      text: `${metrics.ctr.toFixed(1)}% CTR, ${Math.abs(ctrDelta).toFixed(1)}pp ${ctrDelta > 0 ? 'up' : 'down'} versus the previous period.`,
    })
  }
  const bestRegion = [...regions].filter((g) => g.delivered >= 100).sort((a, b) => b.ctr - a.ctr)[0]
  if (bestRegion)
    out.push({
      tone: 'blue',
      icon: <GlobeIcon />,
      title: `${bestRegion.label} drives the strongest regional CTR`,
      text: `${bestRegion.ctr.toFixed(1)}% CTR and ${fmt(bestRegion.uniqueClicks)} unique clicks in the current scope.`,
    })
  const topTemplate = [...templates]
    .filter((g) => g.delivered >= 100)
    .sort((a, b) => b.uniqueClicks - a.uniqueClicks)[0]
  if (topTemplate)
    out.push({
      tone: 'green',
      icon: <TemplateIcon />,
      title: `${topTemplate.label} contributes the most clicks`,
      text: `${fmt(topTemplate.uniqueClicks)} unique clicks at ${topTemplate.ctr.toFixed(1)}% CTR.`,
    })
  if (metrics.open < benchmark.open - Math.max(2, benchmark.openStats?.iqr || 0))
    out.push({
      tone: 'amber',
      icon: <AlertIcon />,
      title: 'Open rate is below the peer cohort',
      text: `${metrics.open.toFixed(1)}% versus a ${benchmark.open.toFixed(1)}% peer median.`,
    })
  return out.slice(0, 4)
}

function buildHealthScore(agg) {
  if (!agg || !agg.sent) return 100
  const delivery = pctNum(agg.delivered, agg.sent)
  const bounce = pctNum(agg.hardBounces + agg.softBounces, agg.sent)
  const complaints = pctNum(agg.complaints, agg.delivered)
  const unsub = pctNum(agg.unsubscribes, agg.delivered)
  const failed = pctNum(agg.failed, agg.sent)

  let penalty = 0
  penalty += Math.min(28, Math.max(0, 98 - delivery) * 2.5)
  penalty += Math.min(24, bounce * 4.2)
  penalty += Math.min(22, complaints * 135)
  penalty += Math.min(14, unsub * 7)
  penalty += Math.min(12, failed * 2.5)

  return Math.max(0, Math.min(100, Math.round(100 - penalty)))
}

function healthLabel(score) {
  if (score >= 90) return { label: 'Healthy', tone: 'good' }
  if (score >= 75) return { label: 'Watch', tone: 'warning' }
  return { label: 'At risk', tone: 'bad' }
}

function buildDeliverabilityAlerts(agg) {
  const out = []
  if (!agg?.sent) return out

  const delivery = pctNum(agg.delivered, agg.sent)
  const bounce = pctNum(agg.hardBounces + agg.softBounces, agg.sent)
  const complaints = pctNum(agg.complaints, agg.delivered)
  const failed = pctNum(agg.failed, agg.sent)
  const unsub = pctNum(agg.unsubscribes, agg.delivered)

  if (complaints >= 0.1) {
    out.push({
      tone: 'red',
      icon: <FlagIcon />,
      title: 'Complaint rate is elevated',
      text: `${complaints.toFixed(3)}% of delivered messages generated complaints. Investigate the campaigns, audience source and frequency behind the spike.`,
    })
  }
  if (bounce >= 5) {
    out.push({
      tone: 'red',
      icon: <BounceIcon />,
      title: 'Bounce rate needs attention',
      text: `${bounce.toFixed(1)}% of sent messages bounced. Segment hard versus soft bounces before the next large send.`,
    })
  }
  if (delivery < 95) {
    out.push({
      tone: 'amber',
      icon: <MailIcon />,
      title: 'Delivery rate is below the dashboard target',
      text: `${delivery.toFixed(1)}% delivered. Check whether the drop is concentrated in a source, region or campaign.`,
    })
  }
  if (failed > 2) {
    out.push({
      tone: 'amber',
      icon: <AlertIcon />,
      title: 'Failed delivery volume is elevated',
      text: `${failed.toFixed(1)}% of sends are marked failed in the current dataset.`,
    })
  }
  if (unsub > 1.5) {
    out.push({
      tone: 'amber',
      icon: <BanIcon />,
      title: 'Unsubscribe rate is rising',
      text: `${unsub.toFixed(2)}% of delivered messages generated unsubscribes. Review relevance and frequency.`,
    })
  }

  return out.slice(0, 4)
}

function buildDeliverabilityRegions(list) {
  return groupBy(list, 'region', 'region')
    .map((g) => ({
      ...g,
      score: buildHealthScore(g),
      delivery: pctNum(g.delivered, g.sent),
      bounce: pctNum(g.hardBounces + g.softBounces, g.sent),
      complaints: pctNum(g.complaints, g.delivered),
      unsub: pctNum(g.unsubscribes, g.delivered),
    }))
    .sort((a, b) => a.score - b.score)
}

function analyzeDataQuality(rows, tplMap, campaigns) {
  const templateKeys = [...new Set(rows.map((r) => r.templateKey).filter(Boolean))]
  const unmappedKeys = templateKeys.filter((key) => !tplMap[key]).sort()
  const mappedKeys = templateKeys.length - unmappedKeys.length
  const mappingCoverage = templateKeys.length ? (mappedKeys / templateKeys.length) * 100 : 100

  const missingTemplateRows = rows.filter((r) => !r.templateKey && !r.templateName)
  const missingRegionRows = rows.filter((r) => !r.region || r.region === '—')
  const zeroSentWithActivity = rows.filter(
    (r) =>
      (r.sent || 0) === 0 &&
      ((r.delivered || 0) > 0 || (r.uniqueOpens || 0) > 0 || (r.uniqueClicks || 0) > 0),
  )

  const integrityRows = rows.filter((r) => {
    const sent = r.sent || 0
    const delivered = r.delivered || 0
    const opens = r.uniqueOpens || 0
    const totalOpens = r.totalOpens || 0
    const clicks = r.uniqueClicks || 0
    const totalClicks = r.totalClicks || 0
    const bounces = (r.hardBounces || 0) + (r.softBounces || 0)
    return (
      delivered > sent ||
      opens > delivered ||
      clicks > delivered ||
      totalOpens < opens ||
      totalClicks < clicks ||
      bounces > sent ||
      (r.complaints || 0) > delivered ||
      (r.unsubscribes || 0) > delivered
    )
  })

  const dimensionMap = new Map()
  for (const r of rows) {
    const key = [
      String(r.date || '').slice(0, 10),
      r.channel || '',
      r.source || '',
      r.templateKey || r.templateName || '',
      r.region || '',
    ].join('|')
    dimensionMap.set(key, (dimensionMap.get(key) || 0) + 1)
  }
  const duplicateKeys = [...dimensionMap.entries()].filter(([, count]) => count > 1)
  const duplicateCount = duplicateKeys.reduce((sum, [, count]) => sum + (count - 1), 0)

  const activeKeys = new Set(templateKeys)
  const orphanCampaignKeys = [
    ...new Set(campaigns.flatMap((c) => c.keys || []).filter((key) => key && !activeKeys.has(key))),
  ].sort()

  const issues = []
  if (unmappedKeys.length) {
    issues.push({
      id: 'unmapped',
      tone: mappingCoverage < 80 ? 'red' : 'amber',
      title: 'Unmapped template keys',
      count: unmappedKeys.length,
      text: 'These canonical keys exist in analytics rows but have no Template Mapping, which can fragment template and family reporting.',
      samples: unmappedKeys,
    })
  }
  if (missingTemplateRows.length) {
    issues.push({
      id: 'missing-template',
      tone: 'red',
      title: 'Rows without template identity',
      count: missingTemplateRows.length,
      text: 'Rows without both a template key and template name cannot be attributed reliably.',
      samples: missingTemplateRows.map((r) => String(r.date || '').slice(0, 10)),
    })
  }
  if (missingRegionRows.length) {
    issues.push({
      id: 'missing-region',
      tone: 'amber',
      title: 'Missing region values',
      count: missingRegionRows.length,
      text: 'Regional breakdowns will exclude or bucket these rows under an unknown value.',
      samples: missingRegionRows.map((r) => r.templateKey || r.templateName || 'unknown template'),
    })
  }
  if (integrityRows.length) {
    issues.push({
      id: 'integrity',
      tone: 'red',
      title: 'Metric integrity conflicts',
      count: integrityRows.length,
      text: 'One or more rows contain impossible relationships such as delivered > sent, opens > delivered, or total events below unique events.',
      samples: integrityRows.map(
        (r) =>
          `${String(r.date || '').slice(0, 10)} · ${r.templateKey || r.templateName || 'unknown'}`,
      ),
    })
  }
  if (zeroSentWithActivity.length) {
    issues.push({
      id: 'zero-sent',
      tone: 'red',
      title: 'Activity exists with zero sent',
      count: zeroSentWithActivity.length,
      text: 'These rows report delivery or engagement while sent is zero, indicating a rollup or ingestion inconsistency.',
      samples: zeroSentWithActivity.map(
        (r) =>
          `${String(r.date || '').slice(0, 10)} · ${r.templateKey || r.templateName || 'unknown'}`,
      ),
    })
  }
  if (duplicateCount) {
    issues.push({
      id: 'duplicates',
      tone: 'amber',
      title: 'Duplicate rollup dimensions',
      count: duplicateCount,
      text: 'More than one row exists for the same date, channel, source, template and region dimension, which can double-count metrics.',
      samples: duplicateKeys.map(([key]) => key),
    })
  }

  const integrityCount = integrityRows.length + zeroSentWithActivity.length
  let score = 100
  score -= Math.min(30, integrityCount * 8)
  score -= Math.min(20, duplicateCount * 3)
  score -= Math.min(22, unmappedKeys.length * 4)
  score -= Math.min(12, missingTemplateRows.length * 4)
  score -= Math.min(8, missingRegionRows.length * 2)
  score = Math.max(0, Math.round(score))

  return {
    score,
    issues,
    templateKeys: templateKeys.length,
    mappedKeys,
    mappingCoverage,
    unmappedKeys,
    orphanCampaignKeys,
    integrityCount,
    duplicateCount,
  }
}

function languageOfRow(row) {
  if (row?.language) return normalizeLanguage(row.language)
  if (row?.source === 'onesignal_china') return 'Chinese'
  const hay = `${row?.templateKey || ''} ${row?.templateName || ''}`.toLowerCase()
  const hints = [
    ['Chinese', /(?:^|[\s_-])(zh(?:-hans|-hant)?|cn|tc)(?:$|[\s_-])/i],
    ['Japanese', /(?:^|[\s_-])(ja|jp)(?:$|[\s_-])|japan|japanese/i],
    ['Portuguese', /(?:^|[\s_-])(pt|pt-br)(?:$|[\s_-])|portuguese/i],
    ['Spanish', /(?:^|[\s_-])(es|es-es|es-latam)(?:$|[\s_-])|spanish/i],
    ['Arabic', /(?:^|[\s_-])(ar)(?:$|[\s_-])|arabic/i],
    ['German', /(?:^|[\s_-])(de)(?:$|[\s_-])|german/i],
    ['Italian', /(?:^|[\s_-])(it)(?:$|[\s_-])|italian/i],
    ['Polish', /(?:^|[\s_-])(pl)(?:$|[\s_-])|polish/i],
    ['English', /(?:^|[\s_-])(en|en-gb|en-us)(?:$|[\s_-])|english/i],
  ]
  for (const [label, re] of hints) if (re.test(hay)) return label
  return 'Unknown'
}

function normalizeLanguage(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  const map = {
    en: 'English',
    english: 'English',
    es: 'Spanish',
    spanish: 'Spanish',
    pt: 'Portuguese',
    'pt-br': 'Portuguese',
    portuguese: 'Portuguese',
    ar: 'Arabic',
    arabic: 'Arabic',
    de: 'German',
    german: 'German',
    it: 'Italian',
    italian: 'Italian',
    pl: 'Polish',
    polish: 'Polish',
    ja: 'Japanese',
    jp: 'Japanese',
    japanese: 'Japanese',
    zh: 'Chinese',
    cn: 'Chinese',
    tc: 'Chinese',
    'zh-hans': 'Chinese',
    'zh-hant': 'Chinese',
    chinese: 'Chinese',
  }
  return map[v] || String(value || 'Unknown')
}

function groupByDerived(list, derive) {
  const map = new Map()
  for (const r of list) {
    const label = derive(r) || 'Unknown'
    if (!map.has(label)) map.set(label, [])
    map.get(label).push(r)
  }
  return [...map.entries()].map(([label, rows]) => {
    const agg = sumRows(rows)
    return { label, ...agg, ...metricsFromAgg(agg) }
  })
}

function buildMetricGroupBenchmark(groups) {
  const eligible = groups.filter((g) => g && g.delivered >= 100)
  const source = eligible.length ? eligible : groups
  return {
    open: quantile(
      source.map((g) => g.open),
      0.5,
    ),
    ctr: quantile(
      source.map((g) => g.ctr),
      0.5,
    ),
    ctor: quantile(
      source.map((g) => g.ctor),
      0.5,
    ),
    delivery: quantile(
      source.map((g) => g.delivery),
      0.5,
    ),
  }
}

function buildAudienceOutliers(groups, benchmark) {
  const out = []
  for (const g of groups.filter((x) => x.delivered >= 100)) {
    const openDiff = g.open - benchmark.open
    const ctrDiff = g.ctr - benchmark.ctr
    if (openDiff >= 4 || ctrDiff >= 2) {
      out.push({
        label: g.label,
        tone: 'good',
        score: Math.max(openDiff / 4, ctrDiff / 2),
        text: `${openDiff >= 4 ? `${openDiff.toFixed(1)}pp above median open` : `${ctrDiff.toFixed(1)}pp above median CTR`}.`,
      })
    } else if (openDiff <= -4 || ctrDiff <= -2) {
      out.push({
        label: g.label,
        tone: 'bad',
        score: Math.max(Math.abs(openDiff) / 4, Math.abs(ctrDiff) / 2),
        text: `${openDiff <= -4 ? `${Math.abs(openDiff).toFixed(1)}pp below median open` : `${Math.abs(ctrDiff).toFixed(1)}pp below median CTR`}.`,
      })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6)
}

function buildActiveAlerts({
  current,
  previous,
  scopeCurrent,
  campaigns,
  tplMap,
  rules = DEFAULT_ALERT_RULES,
}) {
  const alerts = []
  const agg = sumRows(current)
  const prev = sumRows(previous)
  const m = metricsFromAgg(agg)
  const pm = metricsFromAgg(prev)
  const quality = analyzeDataQuality(current, tplMap, campaigns)

  if (agg.sent > 0 && m.delivery < rules.deliveryMin)
    alerts.push({
      id: 'delivery',
      severity: m.delivery < rules.deliveryMin - 2 ? 'critical' : 'warning',
      category: 'Deliverability',
      metric: 'Delivery rate',
      title: 'Delivery rate below threshold',
      text: `Current delivery is ${m.delivery.toFixed(1)}%, below the configured ${rules.deliveryMin.toFixed(1)}% minimum.`,
      value: `${m.delivery.toFixed(1)}%`,
    })
  if (pm.open > 0 && m.open <= pm.open - rules.openDropMax)
    alerts.push({
      id: 'open-drop',
      severity: m.open <= pm.open - rules.openDropMax * 1.7 ? 'critical' : 'warning',
      category: 'Engagement',
      metric: 'Open rate',
      title: 'Open rate declined materially',
      text: `Open rate is down ${(pm.open - m.open).toFixed(1)}pp versus the previous comparable period.`,
      value: `-${(pm.open - m.open).toFixed(1)}pp`,
    })
  if (pm.ctr > 0 && m.ctr <= pm.ctr - rules.ctrDropMax)
    alerts.push({
      id: 'ctr-drop',
      severity: m.ctr <= pm.ctr - rules.ctrDropMax * 1.7 ? 'critical' : 'warning',
      category: 'Engagement',
      metric: 'CTR',
      title: 'CTR declined materially',
      text: `CTR is down ${(pm.ctr - m.ctr).toFixed(1)}pp versus the previous comparable period.`,
      value: `-${(pm.ctr - m.ctr).toFixed(1)}pp`,
    })
  if (m.complaints >= rules.complaintMax)
    alerts.push({
      id: 'complaints',
      severity: m.complaints >= rules.complaintMax * 1.5 ? 'critical' : 'warning',
      category: 'Deliverability',
      metric: 'Complaints',
      title: 'Complaint rate above threshold',
      text: `Complaint rate is ${m.complaints.toFixed(3)}% against a configured maximum of ${rules.complaintMax.toFixed(3)}%.`,
      value: `${m.complaints.toFixed(3)}%`,
    })
  if (m.bounce >= rules.bounceMax)
    alerts.push({
      id: 'bounce',
      severity: m.bounce >= rules.bounceMax * 1.4 ? 'critical' : 'warning',
      category: 'Deliverability',
      metric: 'Bounce rate',
      title: 'Bounce rate above threshold',
      text: `Combined hard + soft bounce is ${m.bounce.toFixed(1)}%, above the ${rules.bounceMax.toFixed(1)}% maximum.`,
      value: `${m.bounce.toFixed(1)}%`,
    })
  if (m.unsub >= rules.unsubscribeMax)
    alerts.push({
      id: 'unsubscribe',
      severity: m.unsub >= rules.unsubscribeMax * 1.5 ? 'critical' : 'warning',
      category: 'Audience',
      metric: 'Unsubscribe',
      title: 'Unsubscribe rate above threshold',
      text: `Unsubscribe rate is ${m.unsub.toFixed(2)}%, above the ${rules.unsubscribeMax.toFixed(2)}% maximum.`,
      value: `${m.unsub.toFixed(2)}%`,
    })
  if (quality.score < rules.dataQualityMin)
    alerts.push({
      id: 'data-quality',
      severity: quality.score < rules.dataQualityMin - 15 ? 'critical' : 'warning',
      category: 'Data quality',
      metric: 'Quality score',
      title: 'Data quality is below threshold',
      text: `${quality.issues.length} issue type${quality.issues.length === 1 ? '' : 's'} detected in the current scope.`,
      value: `${quality.score}/100`,
    })

  const campaignGroups = enrichCampaignGroups(buildCampaignGroups(scopeCurrent, campaigns))
  for (const g of campaignGroups.filter((x) => x.status.tone === 'bad').slice(0, 3)) {
    alerts.push({
      id: `campaign-${g.label}`,
      severity: 'warning',
      category: 'Campaign',
      metric: g.status.label,
      title: `${g.label} needs attention`,
      text: `${g.delivery.toFixed(1)}% delivery · ${g.bounce.toFixed(1)}% bounce · ${g.complaints.toFixed(3)}% complaints.`,
      value: g.status.label,
    })
  }

  const rank = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
}

function buildIntelligenceFeed({
  current,
  previous,
  scopeCurrent,
  scopePrevious,
  campaigns,
  tplMap,
}) {
  const out = []
  const agg = sumRows(current)
  const prev = sumRows(previous)
  const m = metricsFromAgg(agg)
  const pm = metricsFromAgg(prev)
  const campaignGroups = enrichCampaignGroups(
    buildCampaignGroups(scopeCurrent, campaigns),
    new Map(buildCampaignGroups(scopePrevious, campaigns).map((g) => [g.label, g])),
  )
  const benchmark = buildCampaignBenchmark(campaignGroups)
  const quality = analyzeDataQuality(current, tplMap, campaigns)

  const risk = campaignGroups.find((g) => g.status.tone === 'bad')
  if (risk)
    out.push({
      severity: 'critical',
      category: 'CAMPAIGN',
      priority: 'High priority',
      title: `${risk.label} is outside healthy operating range`,
      text: `${risk.delivery.toFixed(1)}% delivery, ${risk.bounce.toFixed(1)}% bounce and ${risk.complaints.toFixed(3)}% complaints.`,
      action: 'Open Campaigns → 360° and isolate the region/template causing the issue.',
    })

  if (pm.open > 0 && m.open <= pm.open - 3)
    out.push({
      severity: 'warning',
      category: 'ENGAGEMENT',
      priority: 'Watch',
      title: 'Open rate is losing momentum',
      text: `${m.open.toFixed(1)}% open rate is ${(pm.open - m.open).toFixed(1)}pp below the previous comparable period.`,
      action: 'Compare recent campaigns and review subject/template performance.',
    })
  if (pm.ctr > 0 && m.ctr <= pm.ctr - 1.5)
    out.push({
      severity: 'warning',
      category: 'ENGAGEMENT',
      priority: 'Watch',
      title: 'Click-through rate declined',
      text: `${m.ctr.toFixed(1)}% CTR is ${(pm.ctr - m.ctr).toFixed(1)}pp below the previous period.`,
      action: 'Review CTOR and template contribution to separate content from open-rate effects.',
    })

  const regions = metricGroups(current, 'region', 'region').filter((g) => g.delivered >= 100)
  const regionBench = buildMetricGroupBenchmark(regions)
  const weakRegion = [...regions].sort((a, b) => a.open - b.open)[0]
  if (weakRegion && weakRegion.open <= regionBench.open - 4)
    out.push({
      severity: 'warning',
      category: 'AUDIENCE',
      priority: 'Opportunity',
      title: `${weakRegion.label} is an audience outlier`,
      text: `${weakRegion.open.toFixed(1)}% open rate is ${(regionBench.open - weakRegion.open).toFixed(1)}pp below the regional median.`,
      action: 'Open Audience → Regions and compare channel/template mix.',
    })

  const templates = metricGroups(current, 'templateKey', 'templateName').filter(
    (g) => g.delivered >= 100,
  )
  const tplBench = buildMetricGroupBenchmark(templates)
  const highVolumeWeak = [...templates]
    .filter(
      (g) =>
        g.sent >=
          quantile(
            templates.map((x) => x.sent),
            0.65,
          ) && g.open < tplBench.open - 4,
    )
    .sort((a, b) => b.sent - a.sent)[0]
  if (highVolumeWeak)
    out.push({
      severity: 'warning',
      category: 'TEMPLATE',
      priority: 'Opportunity',
      title: `${highVolumeWeak.label} is a high-volume underperformer`,
      text: `${fmt(highVolumeWeak.sent)} sends at ${highVolumeWeak.open.toFixed(1)}% open rate, ${(tplBench.open - highVolumeWeak.open).toFixed(1)}pp below the template median.`,
      action: 'Review the template or reduce reuse before the next large send.',
    })

  if (quality.score < 90)
    out.push({
      severity: quality.score < 75 ? 'critical' : 'warning',
      category: 'DATA QUALITY',
      priority: 'Foundation',
      title: `Data quality score is ${quality.score}/100`,
      text: `${quality.issues.length} issue type${quality.issues.length === 1 ? '' : 's'} can reduce confidence in comparisons and attribution.`,
      action: 'Open Data Quality and resolve integrity/mapping issues first.',
    })

  const strong = [...campaignGroups]
    .filter((g) => g.status.tone === 'good')
    .sort((a, b) => b.open - benchmark.open + (b.ctr - benchmark.ctr))[0]
  if (strong)
    out.push({
      severity: 'positive',
      category: 'OPPORTUNITY',
      priority: 'Learn',
      title: `${strong.label} is outperforming its peer cohort`,
      text: `${strong.open.toFixed(1)}% open and ${strong.ctr.toFixed(1)}% CTR versus ${benchmark.open.toFixed(1)}% / ${benchmark.ctr.toFixed(1)}% medians.`,
      action: 'Use the 360° view to identify the region and template contribution worth repeating.',
    })

  if (!out.length)
    out.push({
      severity: 'positive',
      category: 'SYSTEM',
      priority: 'Healthy',
      title: 'No material negative signals detected',
      text: 'Current engagement, deliverability and data quality are within the dashboard’s actionable ranges.',
      action:
        'Use Campaign Comparison to look for optimization opportunities rather than remediation.',
    })

  const rank = { critical: 0, warning: 1, positive: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 6)
}

function dataQualityLabel(score) {
  if (score >= 95) return { label: 'Excellent', tone: 'good' }
  if (score >= 80) return { label: 'Good', tone: 'warning' }
  return { label: 'Needs attention', tone: 'bad' }
}

function groupBy(list, key, labelKey) {
  const map = new Map()
  for (const r of list) {
    const id = r[key] || '—'
    if (!map.has(id)) map.set(id, { label: r[labelKey] || id, rows: [] })
    map.get(id).rows.push(r)
  }
  return [...map.values()]
    .map((g) => ({ label: g.label, ...sumRows(g.rows) }))
    .sort((a, b) => pctNum(b.uniqueOpens, b.delivered) - pctNum(a.uniqueOpens, a.delivered))
}
function weekKey(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Monday=0
  d.setDate(d.getDate() - day)
  return d
}
function buildTrend(list, weekly) {
  const map = new Map()
  for (const r of list) {
    const base = weekly ? weekKey(r.date) : new Date(r.date)
    const label = base.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    if (!map.has(label))
      map.set(label, { d: label, delivered: 0, opens: 0, clicks: 0, t: base.getTime() })
    const o = map.get(label)
    o.delivered += r.delivered || 0
    o.opens += r.uniqueOpens || 0
    o.clicks += r.uniqueClicks || 0
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}
function buildKpiTrend(list, weekly) {
  const map = new Map()
  for (const r of list) {
    const base = weekly ? weekKey(r.date) : new Date(r.date)
    const label = base.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    if (!map.has(label)) map.set(label, { d: label, rows: [], t: base.getTime() })
    map.get(label).rows.push(r)
  }
  return [...map.values()]
    .sort((a, b) => a.t - b.t)
    .map((g) => {
      const a = sumRows(g.rows)
      return {
        d: g.d,
        sent: a.sent,
        deliveryRate: pctNum(a.delivered, a.sent),
        openRate: pctNum(a.uniqueOpens, a.delivered),
        ctr: pctNum(a.uniqueClicks, a.delivered),
        ctor: pctNum(a.uniqueClicks, a.uniqueOpens),
        complaintRate: pctNum(a.complaints, a.delivered),
        bounceRate: pctNum(a.hardBounces + a.softBounces, a.sent),
        unsubRate: pctNum(a.unsubscribes, a.delivered),
      }
    })
}

function buildDeliverabilityTrend(list, weekly) {
  const map = new Map()
  for (const r of list) {
    const base = weekly ? weekKey(r.date) : new Date(r.date)
    const label = base.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    if (!map.has(label)) map.set(label, { d: label, complaints: 0, bounces: 0, t: base.getTime() })
    const o = map.get(label)
    o.complaints += r.complaints || 0
    o.bounces += (r.hardBounces || 0) + (r.softBounces || 0)
  }
  return [...map.values()].sort((a, b) => a.t - b.t)
}
function ppDelta(now, prev, dp = 1) {
  if (prev === 0 && now === 0) return null
  const diff = now - prev
  if (Math.abs(diff) < 0.05) return { txt: '≈', up: null }
  return { txt: (diff > 0 ? '+' : '') + diff.toFixed(dp) + 'pp', up: diff > 0 }
}
function relDelta(now, prev) {
  if (prev === 0) return now > 0 ? { txt: 'new', up: true } : null
  const diff = ((now - prev) / prev) * 100
  if (Math.abs(diff) < 0.5) return { txt: '≈', up: null }
  return { txt: (diff > 0 ? '+' : '') + diff.toFixed(0) + '%', up: diff > 0 }
}
function buildOverviewIntelligence(agg, aggPrev, current) {
  const out = []
  const open = pctNum(agg.uniqueOpens, agg.delivered)
  const openPrev = pctNum(aggPrev.uniqueOpens, aggPrev.delivered)
  const ctr = pctNum(agg.uniqueClicks, agg.delivered)
  const ctrPrev = pctNum(aggPrev.uniqueClicks, aggPrev.delivered)
  const openDelta = open - openPrev
  const ctrDelta = ctr - ctrPrev

  if (aggPrev.delivered > 0 && Math.abs(openDelta) >= 2) {
    out.push({
      tone: openDelta > 0 ? 'green' : 'red',
      icon: <EyeIcon />,
      title: `Open rate ${openDelta > 0 ? 'improved' : 'declined'}`,
      text: `${Math.abs(openDelta).toFixed(1)}pp ${openDelta > 0 ? 'above' : 'below'} the previous comparable period.`,
    })
  }

  if (aggPrev.delivered > 0 && Math.abs(ctrDelta) >= 1) {
    out.push({
      tone: ctrDelta > 0 ? 'purple' : 'amber',
      icon: <PointerIcon />,
      title: `CTR ${ctrDelta > 0 ? 'is gaining' : 'needs attention'}`,
      text: `${ctr.toFixed(1)}% CTR, ${Math.abs(ctrDelta).toFixed(1)}pp ${ctrDelta > 0 ? 'up' : 'down'} versus the previous period.`,
    })
  }

  const regions = groupBy(current, 'region', 'region').filter((g) => g.delivered >= 100)
  const weakest = [...regions].sort(
    (a, b) => pctNum(a.uniqueOpens, a.delivered) - pctNum(b.uniqueOpens, b.delivered),
  )[0]
  if (weakest) {
    const weakOpen = pctNum(weakest.uniqueOpens, weakest.delivered)
    if (weakOpen <= open - 6) {
      out.push({
        tone: 'amber',
        icon: <FlagIcon />,
        title: `${weakest.label} is below the aggregate`,
        text: `${weakOpen.toFixed(1)}% open rate, ${Math.abs(weakOpen - open).toFixed(1)}pp below the current overall rate.`,
      })
    }
  }

  const templates = groupBy(current, 'templateKey', 'templateName').filter(
    (g) => g.delivered >= 100,
  )
  const top = [...templates].sort(
    (a, b) => pctNum(b.uniqueClicks, b.delivered) - pctNum(a.uniqueClicks, a.delivered),
  )[0]
  if (top) {
    out.push({
      tone: 'blue',
      icon: <SparkleIcon />,
      title: 'Top click driver',
      text: `${top.label} leads the current period at ${pctNum(top.uniqueClicks, top.delivered).toFixed(1)}% CTR.`,
    })
  }

  return out.slice(0, 3)
}

function buildSummary(agg, aggPrev, current) {
  const bits = []
  const openNow = pctNum(agg.uniqueOpens, agg.delivered),
    openPrev = pctNum(aggPrev.uniqueOpens, aggPrev.delivered)
  if (openPrev > 0) {
    const d = openNow - openPrev
    if (Math.abs(d) >= 0.5)
      bits.push(
        `Open rate ${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)}pp vs the previous period`,
      )
  }
  const templates = groupBy(current, 'templateKey', 'templateName')
  if (templates.length)
    bits.push(
      `top template is ${templates[0].label} (${pctNum(templates[0].uniqueOpens, templates[0].delivered).toFixed(0)}% open)`,
    )
  const cr = pctNum(agg.complaints, agg.delivered)
  if (cr > 0.1) bits.push(`⚠️ complaint rate ${cr.toFixed(3)}% is above the safe threshold`)
  if (!bits.length) return null
  return bits.map((b, i) => (i === 0 ? b.charAt(0).toUpperCase() + b.slice(1) : b)).join('; ') + '.'
}

function buildWeeklyBrief(rows, campaigns, tplMap) {
  if (!rows.length) {
    return {
      hasData: false,
      metrics: [],
      bullets: [],
      recommendation: 'No activity available.',
      text: 'Marketing Weekly Brief\n\nNo activity available in the selected scope.',
      endDate: '',
      endLabel: '—',
    }
  }

  const anchor = rows.reduce((max, row) => {
    const value = new Date(row.date).getTime()
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const end = new Date(anchor)
  end.setHours(23, 59, 59, 999)
  const curStart = end.getTime() - 6 * dayMs
  const prevEnd = curStart - 1
  const prevStart = prevEnd - 6 * dayMs
  const week = rows.filter((row) => {
    const t = new Date(row.date).getTime()
    return t >= curStart && t <= end.getTime()
  })
  const prior = rows.filter((row) => {
    const t = new Date(row.date).getTime()
    return t >= prevStart && t <= prevEnd
  })

  if (!week.length) {
    return {
      hasData: false,
      metrics: [],
      bullets: [],
      recommendation: 'No activity available.',
      text: 'Marketing Weekly Brief\n\nNo activity available in the latest 7-day window.',
      endDate: toDateKey(end),
      endLabel: end.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    }
  }

  const agg = sumRows(week)
  const prevAgg = sumRows(prior)
  const m = metricsFromAgg(agg)
  const p = metricsFromAgg(prevAgg)
  const campaignGroups = enrichCampaignGroups(buildCampaignGroups(week, campaigns))
  const topCampaign = [...campaignGroups].sort((a, b) => b.uniqueClicks - a.uniqueClicks)[0]
  const templateGroups = metricGroups(week, 'templateKey', 'templateName')
  const topTemplate = [...templateGroups].sort((a, b) => b.uniqueClicks - a.uniqueClicks)[0]
  const quality = analyzeDataQuality(week, tplMap, campaigns)
  const healthScore = buildHealthScore(agg)
  const intelligence = buildIntelligenceFeed({
    current: week,
    previous: prior,
    scopeCurrent: week,
    scopePrevious: prior,
    campaigns,
    tplMap,
  })

  const hasPrior = prevAgg.sent > 0 || prevAgg.delivered > 0
  const sentChange = prevAgg.sent ? ((agg.sent - prevAgg.sent) / prevAgg.sent) * 100 : null
  const bullets = []
  bullets.push(
    `${fmt(agg.sent)} messages were sent and ${fmt(agg.delivered)} delivered${sentChange == null ? '' : `, ${Math.abs(sentChange).toFixed(1)}% ${sentChange >= 0 ? 'above' : 'below'} the preceding week`}.`,
  )
  bullets.push(
    hasPrior
      ? `Open rate finished at ${m.open.toFixed(1)}% (${signedPp(m.open - p.open)} vs prior week) and CTR at ${m.ctr.toFixed(1)}% (${signedPp(m.ctr - p.ctr)}).`
      : `Open rate finished at ${m.open.toFixed(1)}% and CTR at ${m.ctr.toFixed(1)}%; no comparable prior-week volume is available.`,
  )
  if (topCampaign) {
    bullets.push(
      `${topCampaign.label} generated the most campaign-attributed unique clicks (${fmt(topCampaign.uniqueClicks)}) at ${topCampaign.ctr.toFixed(1)}% CTR.`,
    )
  }
  if (topTemplate) {
    bullets.push(
      `${topTemplate.label} was the strongest template by unique-click contribution (${fmt(topTemplate.uniqueClicks)} clicks, ${topTemplate.ctr.toFixed(1)}% CTR).`,
    )
  }
  bullets.push(
    `Deliverability health is ${healthScore}/100 and reporting data quality is ${quality.score}/100.`,
  )

  const recommendation =
    intelligence[0]?.action ||
    intelligence[0]?.text ||
    (healthScore < 90
      ? 'Review deliverability signals and isolate the campaigns or regions creating the health penalty.'
      : quality.score < 90
        ? 'Resolve the highest-severity mapping or integrity findings before using the data for deeper optimization.'
        : 'Keep the strongest campaign/template pattern as the next test baseline and validate it against a comparable audience.')

  const endDate = toDateKey(end)
  const endLabel = end.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const text = [
    'Marketing Weekly Brief',
    `Week ending ${endLabel}`,
    '',
    `Sent: ${fmt(agg.sent)}`,
    `Delivered: ${fmt(agg.delivered)} (${m.delivery.toFixed(1)}%)`,
    `Open rate: ${m.open.toFixed(1)}%${hasPrior ? ` (${signedPp(m.open - p.open)} vs prior week)` : ''}`,
    `CTR: ${m.ctr.toFixed(1)}%${hasPrior ? ` (${signedPp(m.ctr - p.ctr)} vs prior week)` : ''}`,
    `CTOR: ${m.ctor.toFixed(1)}%`,
    '',
    'What changed',
    ...bullets.map((line) => `- ${line}`),
    '',
    `Recommended focus: ${recommendation}`,
  ].join('\n')

  return {
    hasData: true,
    endDate,
    endLabel,
    metrics: [
      {
        label: 'Open rate',
        value: `${m.open.toFixed(1)}%`,
        delta: hasPrior ? m.open - p.open : null,
      },
      { label: 'CTR', value: `${m.ctr.toFixed(1)}%`, delta: hasPrior ? m.ctr - p.ctr : null },
      {
        label: 'Delivery',
        value: `${m.delivery.toFixed(1)}%`,
        delta: hasPrior ? m.delivery - p.delivery : null,
      },
      {
        label: 'Bounce',
        value: `${m.bounce.toFixed(1)}%`,
        delta: hasPrior ? m.bounce - p.bounce : null,
      },
    ],
    bullets,
    recommendation,
    text,
  }
}

function signedPp(value) {
  if (!Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}pp`
}

function downloadTextFile(name, text) {
  if (typeof window === 'undefined') return
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function formatShortDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function calendarMonthLabel(month) {
  if (!month) return '—'
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function buildCampaignCalendarEntries(rows, campaigns) {
  const campaignsByKey = new Map()
  for (const campaign of campaigns) {
    for (const key of campaign.keys || []) {
      if (!campaignsByKey.has(key)) campaignsByKey.set(key, [])
      campaignsByKey.get(key).push(campaign)
    }
  }

  const groups = new Map()
  for (const row of rows) {
    const matching = campaignsByKey.get(row.templateKey) || []
    if (!matching.length) continue
    const date = toDateKey(row.date)
    if (!date) continue
    for (const campaign of matching) {
      const id = `${date}|${campaign.name}`
      if (!groups.has(id))
        groups.set(id, {
          date,
          month: date.slice(0, 7),
          campaign: campaign.name,
          color: campaign.color,
          rows: [],
        })
      groups.get(id).rows.push(row)
    }
  }

  return [...groups.values()]
    .map((group) => {
      const agg = sumRows(group.rows)
      const metrics = metricsFromAgg(agg)
      return { ...group, ...agg, ...metrics }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || b.sent - a.sent)
}

function buildTemplateFatigue(rows, tplMap) {
  const templates = new Map()
  for (const row of rows) {
    const key = row.templateKey || row.templateName
    if (!key) continue
    const date = toDateKey(row.date)
    if (!date) continue
    if (!templates.has(key)) templates.set(key, new Map())
    const byDate = templates.get(key)
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date).push(row)
  }

  const out = []
  for (const [key, byDate] of templates.entries()) {
    const name =
      tplMap[key]?.name ||
      [...byDate.values()].flat().find((r) => r.templateName)?.templateName ||
      key
    const family = tplMap[key]?.family || familyOfName(name)
    const points = [...byDate.entries()]
      .map(([date, dayRows]) => {
        const agg = sumRows(dayRows)
        return {
          date,
          d: formatShortDate(date),
          sent: agg.sent,
          delivered: agg.delivered,
          uniqueOpens: agg.uniqueOpens,
          uniqueClicks: agg.uniqueClicks,
          open: pctNum(agg.uniqueOpens, agg.delivered),
          ctr: pctNum(agg.uniqueClicks, agg.delivered),
        }
      })
      .filter((point) => point.sent > 0 || point.delivered > 0)
      .sort((a, b) => a.date.localeCompare(b.date))

    const useCount = points.length
    const compareSize = useCount >= 6 ? 3 : useCount >= 4 ? 2 : 0
    let recentOpen = null
    let recentCtr = null
    let openDelta = null
    let ctrDelta = null
    let fatigueScore = 0
    let status = 'insufficient'

    if (compareSize) {
      const priorPoints = points.slice(-(compareSize * 2), -compareSize)
      const recentPoints = points.slice(-compareSize)
      const aggregatePoints = (list) =>
        list.reduce(
          (acc, point) => {
            acc.delivered += point.delivered
            acc.opens += point.uniqueOpens
            acc.clicks += point.uniqueClicks
            return acc
          },
          { delivered: 0, opens: 0, clicks: 0 },
        )
      const prior = aggregatePoints(priorPoints)
      const recent = aggregatePoints(recentPoints)
      const priorOpen = pctNum(prior.opens, prior.delivered)
      const priorCtr = pctNum(prior.clicks, prior.delivered)
      recentOpen = pctNum(recent.opens, recent.delivered)
      recentCtr = pctNum(recent.clicks, recent.delivered)
      openDelta = recentOpen - priorOpen
      ctrDelta = recentCtr - priorCtr
      fatigueScore = Math.max(
        0,
        Math.min(100, Math.round(Math.max(0, -openDelta) * 9 + Math.max(0, -ctrDelta) * 22)),
      )
      if ((openDelta <= -4 && ctrDelta <= -1) || ctrDelta <= -2 || openDelta <= -7)
        status = 'fatigued'
      else if (openDelta <= -3 || ctrDelta <= -1) status = 'watch'
      else status = 'stable'
    }

    out.push({
      key,
      label: name,
      family,
      points,
      useCount,
      lastUsed: points[points.length - 1]?.date || null,
      recentOpen,
      recentCtr,
      openDelta,
      ctrDelta,
      fatigueScore,
      status,
    })
  }

  const rank = { fatigued: 0, watch: 1, stable: 2, insufficient: 3 }
  return out.sort(
    (a, b) =>
      rank[a.status] - rank[b.status] || b.fatigueScore - a.fatigueScore || b.useCount - a.useCount,
  )
}

function buildTemplateLibraryEntries(rows, tplMap) {
  const rowGroups = new Map()
  for (const row of rows) {
    const key = row.templateKey || row.templateName
    if (!key) continue
    if (!rowGroups.has(key)) rowGroups.set(key, [])
    rowGroups.get(key).push(row)
  }
  const keys = new Set([...Object.keys(tplMap), ...rowGroups.keys()])
  return [...keys]
    .map((key) => {
      const activeRows = rowGroups.get(key) || []
      const mapped = Boolean(tplMap[key])
      const label = tplMap[key]?.name || activeRows.find((r) => r.templateName)?.templateName || key
      const family = tplMap[key]?.family || familyOfName(label)
      const agg = sumRows(activeRows)
      const metrics = metricsFromAgg(agg)
      const lastUsed = activeRows.reduce((max, row) => {
        const value = new Date(row.date).getTime()
        return Number.isFinite(value) ? Math.max(max, value) : max
      }, 0)
      return {
        key,
        label,
        family,
        theme: themeOf(label),
        mapped,
        lastUsed: lastUsed ? new Date(lastUsed).toISOString() : null,
        ...agg,
        ...metrics,
      }
    })
    .sort((a, b) => b.sent - a.sent || a.label.localeCompare(b.label))
}

function templateInitials(label) {
  const parts = String(label || 'T')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return 'T'
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function countValues(rows, getter) {
  const map = new Map()
  for (const row of rows) {
    const value = getter(row) || 'Unknown'
    map.set(value, (map.get(value) || 0) + 1)
  }
  return map
}

const KPI_DRILLDOWN_CONFIG = {
  sent: {
    label: 'Sent',
    unit: '',
    color: C.blue,
    explainer: 'Where message volume came from across campaigns, regions, channels and templates.',
  },
  deliveryRate: {
    label: 'Delivery rate',
    unit: '%',
    color: C.greenTxt,
    explainer:
      'Which parts of the selected scope are supporting or dragging overall delivery performance.',
  },
  openRate: {
    label: 'Open rate',
    unit: '%',
    color: C.green,
    explainer:
      'Open efficiency by campaign, region, channel and template. Use it to isolate where engagement differs.',
  },
  ctr: {
    label: 'CTR',
    unit: '%',
    color: C.purple,
    explainer: 'Unique click efficiency by campaign, region, channel and template.',
  },
  ctor: {
    label: 'CTOR',
    unit: '%',
    color: C.purple,
    explainer:
      'Click-to-open efficiency, useful for separating subject/open performance from content performance.',
  },
  complaintRate: {
    label: 'Complaint rate',
    unit: '%',
    color: C.red,
    explainer:
      'Where complaint risk is concentrated. Higher values deserve investigation, especially on meaningful volume.',
  },
  bounceRate: {
    label: 'Bounce rate',
    unit: '%',
    color: C.red,
    explainer: 'Hard + soft bounce concentration across the active scope.',
  },
  unsubRate: {
    label: 'Unsubscribe rate',
    unit: '%',
    color: C.red,
    explainer: 'Where unsubscribe pressure is highest across campaigns and audience dimensions.',
  },
}

function metricValueFromAgg(metric, a) {
  if (!a) return 0
  if (metric === 'sent') return a.sent || 0
  if (metric === 'deliveryRate') return pctNum(a.delivered, a.sent)
  if (metric === 'openRate') return pctNum(a.uniqueOpens, a.delivered)
  if (metric === 'ctr') return pctNum(a.uniqueClicks, a.delivered)
  if (metric === 'ctor') return pctNum(a.uniqueClicks, a.uniqueOpens)
  if (metric === 'complaintRate') return pctNum(a.complaints, a.delivered)
  if (metric === 'bounceRate') return pctNum((a.hardBounces || 0) + (a.softBounces || 0), a.sent)
  if (metric === 'unsubRate') return pctNum(a.unsubscribes, a.delivered)
  return 0
}

function formatMetric(metric, value) {
  if (!Number.isFinite(value)) return '—'
  if (metric === 'sent') return fmt(Math.round(value))
  if (metric === 'complaintRate') return `${value.toFixed(3)}%`
  return `${value.toFixed(1)}%`
}

function buildScopeConfidence(rows, tplMap = {}) {
  const agg = sumRows(rows || [])
  const delivered = agg.delivered || 0
  const rowCount = rows?.length || 0
  const mapped = (rows || []).filter((r) => r.templateKey && tplMap[r.templateKey]).length
  const mappingCoverage = rowCount ? (mapped / rowCount) * 100 : 0
  const volumeScore = Math.min(100, (Math.log10(Math.max(1, delivered)) / 5) * 100)
  const rowScore = Math.min(100, (rowCount / 30) * 100)
  const mappingScore = rowCount ? mappingCoverage : 0
  const score = Math.max(
    0,
    Math.min(100, Math.round(volumeScore * 0.5 + rowScore * 0.25 + mappingScore * 0.25)),
  )
  const level = score >= 75 ? 'high' : score >= 48 ? 'medium' : 'low'
  const label = level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low'
  return {
    score,
    level,
    label,
    delivered,
    rows: rowCount,
    mappingCoverage,
    detail: `${fmt(delivered)} delivered across ${fmt(rowCount)} rollup rows · ${mappingCoverage.toFixed(0)}% of rows have a canonical template mapping.`,
  }
}

function confidenceForMetric(rows, metric) {
  const agg = sumRows(rows || [])
  let denominator = agg.delivered || 0
  if (metric === 'sent' || metric === 'deliveryRate' || metric === 'bounceRate')
    denominator = agg.sent || 0
  if (metric === 'ctor') denominator = agg.uniqueOpens || 0
  const rowCount = rows?.length || 0
  const volumeScore = Math.min(100, (Math.log10(Math.max(1, denominator)) / 5) * 100)
  const breadthScore = Math.min(100, (rowCount / 20) * 100)
  const score = Math.max(0, Math.min(100, Math.round(volumeScore * 0.72 + breadthScore * 0.28)))
  const level = score >= 76 ? 'high' : score >= 48 ? 'medium' : 'low'
  return {
    score,
    level,
    label: level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low',
    detail: `${fmt(denominator)} ${metric === 'ctor' ? 'unique opens' : metric === 'sent' ? 'sent messages' : 'eligible messages'} across ${fmt(rowCount)} rollup rows support this KPI.`,
  }
}

function buildKpiBreakdowns(metric, rows, campaigns, tplMap) {
  const make = (groups) =>
    groups
      .map(({ label, rows: list }) => {
        const agg = sumRows(list)
        return { label: label || 'Unknown', agg, value: metricValueFromAgg(metric, agg) }
      })
      .filter((item) => item.agg.sent > 0 || item.agg.delivered > 0)
      .sort((a, b) => b.value - a.value)

  const mapDimension = (getter) => {
    const map = new Map()
    for (const row of rows || []) {
      const label = getter(row) || 'Unknown'
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(row)
    }
    return make([...map.entries()].map(([label, list]) => ({ label, rows: list })))
  }

  const campaignRows = []
  const assignedKeys = new Set()
  for (const campaign of campaigns || []) {
    const keySet = new Set(campaign.keys || [])
    for (const key of keySet) assignedKeys.add(key)
    const list = (rows || []).filter((row) => keySet.has(row.templateKey))
    if (list.length) campaignRows.push({ label: campaign.name, rows: list })
  }
  const unassigned = (rows || []).filter((row) => !assignedKeys.has(row.templateKey))
  if (unassigned.length) campaignRows.push({ label: 'Unassigned', rows: unassigned })

  return {
    Campaign: make(campaignRows),
    Region: mapDimension((row) => row.region || 'Unknown'),
    Channel: mapDimension(
      (row) => SOURCE_LABEL[row.source] || row.channel || row.source || 'Unknown',
    ),
    Template: mapDimension(
      (row) => tplMap[row.templateKey]?.name || row.templateName || row.templateKey || 'Unmapped',
    ),
  }
}

function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stdDev(values, avg = mean(values)) {
  if (values.length < 2) return 0
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1))
}

function dailyMetricSeries(rows, metric) {
  const byDate = new Map()
  for (const row of rows || []) {
    const key = toDateKey(row.date)
    if (!key) continue
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(row)
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({ date, value: metricValueFromAgg(metric, sumRows(list)) }))
    .filter((item) => Number.isFinite(item.value))
}

function rollingMetricSeries(rows, metric, windowDays = 7) {
  const byDate = new Map()
  for (const row of rows || []) {
    const key = toDateKey(row.date)
    if (!key) continue
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key).push(row)
  }
  const dates = [...byDate.keys()].sort()
  if (dates.length < windowDays) return dailyMetricSeries(rows, metric)
  const out = []
  for (let i = windowDays - 1; i < dates.length; i++) {
    const windowRows = []
    for (let j = i - windowDays + 1; j <= i; j++) windowRows.push(...(byDate.get(dates[j]) || []))
    out.push({ date: dates[i], value: metricValueFromAgg(metric, sumRows(windowRows)) })
  }
  return out.filter((item) => Number.isFinite(item.value))
}

function buildStatisticalAnomalies(current, previous, campaigns, tplMap) {
  if (!current?.length || !previous?.length) return []
  const latestDate = Math.max(
    ...current.map((row) => new Date(row.date).getTime()).filter(Number.isFinite),
  )
  if (!Number.isFinite(latestDate)) return []
  const recentStart = latestDate - 6 * dayMs
  const recentRows = current.filter((row) => new Date(row.date).getTime() >= recentStart)
  const recentAgg = sumRows(recentRows.length ? recentRows : current)
  const definitions = [
    {
      metric: 'deliveryRate',
      label: 'Delivery rate',
      minEffect: 1,
      goodUp: true,
      actionTab: 'Deliverability',
    },
    { metric: 'openRate', label: 'Open rate', minEffect: 2, goodUp: true, actionTab: 'Campaigns' },
    { metric: 'ctr', label: 'CTR', minEffect: 1, goodUp: true, actionTab: 'Campaigns' },
    {
      metric: 'bounceRate',
      label: 'Bounce rate',
      minEffect: 1,
      goodUp: false,
      actionTab: 'Deliverability',
    },
    {
      metric: 'complaintRate',
      label: 'Complaint rate',
      minEffect: 0.03,
      goodUp: false,
      actionTab: 'Deliverability',
    },
    {
      metric: 'unsubRate',
      label: 'Unsubscribe rate',
      minEffect: 0.2,
      goodUp: false,
      actionTab: 'Deliverability',
    },
  ]
  const out = []

  for (const definition of definitions) {
    const baseline = rollingMetricSeries(previous, definition.metric, 7).map((item) => item.value)
    if (baseline.length < 5) continue
    const avg = mean(baseline)
    const sd = stdDev(baseline, avg)
    const value = metricValueFromAgg(definition.metric, recentAgg)
    const diff = value - avg
    const z = sd > 0.0001 ? diff / sd : (diff / Math.max(definition.minEffect, 0.001)) * 2
    if (Math.abs(diff) < definition.minEffect || Math.abs(z) < 2) continue
    const positive = definition.goodUp ? diff > 0 : diff < 0
    const severity = positive ? 'positive' : Math.abs(z) >= 3 ? 'critical' : 'warning'
    const confidence = confidenceForMetric(
      recentRows.length ? recentRows : current,
      definition.metric,
    )
    out.push({
      id: `anomaly-${definition.metric}-${toDateKey(new Date(latestDate))}-${current.length}-${value.toFixed(3)}`,
      severity,
      metric: definition.label,
      title: `${definition.label} is ${Math.abs(diff).toFixed(definition.metric === 'complaintRate' ? 3 : 1)}pp ${diff > 0 ? 'above' : 'below'} historical baseline`,
      text: `Recent value ${formatMetric(definition.metric, value)} vs ${formatMetric(definition.metric, avg)} baseline · ${Math.abs(z).toFixed(1)}σ from normal daily variation.`,
      actionTab: definition.actionTab,
      confidence,
      z,
    })
  }

  const campaignGroups = enrichCampaignGroups(buildCampaignGroups(current, campaigns || []))
    .filter((group) => group.sent > 0 && group.status?.tone === 'bad')
    .slice(0, 2)
  for (const group of campaignGroups) {
    out.push({
      id: `campaign-risk-${group.label}-${toDateKey(new Date(latestDate))}`,
      severity: 'warning',
      metric: 'Campaign',
      title: `${group.label} is outside its comparable-campaign operating range`,
      text: `${group.open.toFixed(1)}% open · ${group.ctr.toFixed(1)}% CTR · ${group.delivery.toFixed(1)}% delivery.`,
      actionTab: 'Campaigns',
      confidence: buildScopeConfidence(
        current.filter((row) =>
          (campaigns.find((c) => c.name === group.label)?.keys || []).includes(row.templateKey),
        ),
        tplMap,
      ),
    })
  }

  const order = { critical: 0, warning: 1, positive: 2 }
  return out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))
}

function buildNotificationFeed(anomalies, current, campaigns, tplMap) {
  const items = [...(anomalies || [])]
  const quality = analyzeDataQuality(current || [], tplMap || {}, campaigns || [])
  if (quality.score < 90) {
    items.push({
      id: `data-quality-${quality.score}-${current?.length || 0}`,
      severity: quality.score < 70 ? 'critical' : 'warning',
      metric: 'Data quality',
      title: `Data quality score is ${quality.score}/100`,
      text: `${quality.issueCount || quality.issues?.length || 0} quality signal${(quality.issueCount || quality.issues?.length || 0) === 1 ? '' : 's'} detected in the current scope.`,
      actionTab: 'Data Quality',
      confidence: buildScopeConfidence(current, tplMap),
    })
  }
  return items.slice(0, 20)
}

function formatRelativeTime(value) {
  if (!value) return 'unknown time'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'unknown time'
  const diff = Date.now() - timestamp
  const min = Math.max(0, Math.round(diff / 60000))
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function DataConfidenceBadge({ confidence }) {
  if (!confidence) return null
  return (
    <span
      className={`analyticsConfidenceBadge ${confidence.level}`}
      title={confidence.detail}
      aria-label={`Data confidence: ${confidence.label}. ${confidence.detail}`}
    >
      <ConfidenceIcon />
      <span>{confidence.label} confidence</span>
      <strong>{confidence.score}</strong>
    </span>
  )
}

function AnomalySummary({ anomalies = [], confidence }) {
  const visible = anomalies.slice(0, 3)
  return (
    <section className={`analyticsAnomalyStrip ${visible.length ? 'hasAnomalies' : 'healthy'}`}>
      <div className="analyticsAnomalyStripHeader">
        <div>
          <span className="analyticsIntelEyebrow">AUTOMATIC ANOMALY DETECTION</span>
          <strong>
            {visible.length
              ? `${anomalies.length} signal${anomalies.length === 1 ? '' : 's'} worth investigating`
              : 'No material anomaly detected'}
          </strong>
        </div>
        {confidence && <DataConfidenceBadge confidence={confidence} />}
      </div>
      {visible.length ? (
        <div className="analyticsAnomalyStripGrid">
          {visible.map((item) => (
            <div className={`analyticsAnomalyMini ${item.severity}`} key={item.id}>
              <div className="analyticsAnomalyMiniIcon">
                <AlertIcon />
              </div>
              <div>
                <span>{item.metric}</span>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="analyticsHealthyInline">
          <ShieldIcon />
          <span>
            Current performance sits inside the historical operating range for the selected scope.
          </span>
        </div>
      )}
    </section>
  )
}

function SavedViewsMenu({ views = [], current, user, onApply, onChanged }) {
  const [open, setOpen] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState('personal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const save = async (event) => {
    event.preventDefault()
    const clean = name.trim()
    if (!clean || saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`${API}/analytics-saved-views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: clean,
          visibility,
          tab: current.tab,
          days: Number(current.days) || 90,
          campaign: current.campaign || 'All',
          channel: current.channel || 'All',
          region: current.region || 'All',
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(data?.message || data?.errors?.[0]?.message || 'Could not save this view.')
      setName('')
      setShowForm(false)
      await onChanged?.()
    } catch (err) {
      setError(err?.message || 'Could not save this view.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (event, view) => {
    event.stopPropagation()
    if (!view?.id) return
    try {
      const response = await fetch(`${API}/analytics-saved-views/${view.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not delete saved view.')
      await onChanged?.()
    } catch (err) {
      setError(err?.message || 'Could not delete saved view.')
    }
  }

  return (
    <div className="analyticsSavedViews" ref={wrapRef}>
      <button
        type="button"
        className="analyticsToolbarButton"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <StarIcon />
        <span>Views</span>
        {views.length > 0 && <b>{views.length}</b>}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="analyticsSavedViewsMenu">
          <div className="analyticsSavedViewsHeader">
            <div>
              <strong>Saved views</strong>
              <span>Jump back to a filter + section combination.</span>
            </div>
            <button
              type="button"
              className="analyticsIconButton compact"
              onClick={() => setShowForm((value) => !value)}
              aria-label="Save current view"
            >
              <PlusIcon />
            </button>
          </div>

          {showForm && (
            <form className="analyticsSaveViewForm" onSubmit={save}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. MENA Email · 30d"
                autoFocus
              />
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
                aria-label="Saved view visibility"
              >
                <option value="personal">Personal</option>
                <option value="team">Team</option>
              </select>
              <button
                type="submit"
                className="analyticsPrimaryButton"
                disabled={!name.trim() || saving}
              >
                {saving ? <ButtonSpinner /> : <StarIcon />} {saving ? 'Saving…' : 'Save'}
              </button>
            </form>
          )}

          {error && (
            <div className="analyticsInlineError">
              <AlertIcon /> {error}
            </div>
          )}

          <div className="analyticsSavedViewsList">
            {views.length === 0 && (
              <Empty>
                Save your current filters once and reuse them without rebuilding the same view every
                day.
              </Empty>
            )}
            {views.map((view) => (
              <div className="analyticsSavedViewRow" key={view.id}>
                <button
                  type="button"
                  className="analyticsSavedViewApply"
                  onClick={() => {
                    onApply?.(view)
                    setOpen(false)
                  }}
                >
                  <span className="analyticsSavedViewIcon">
                    <StarIcon />
                  </span>
                  <span className="analyticsSavedViewCopy">
                    <strong>{view.name}</strong>
                    <small>
                      {view.tab || 'Overview'} · {view.days || 90}d ·{' '}
                      {view.campaign || 'All campaigns'} · {view.channel || 'All channels'} ·{' '}
                      {view.region || 'All regions'}
                    </small>
                  </span>
                </button>
                <span className={`analyticsViewVisibility ${view.visibility || 'personal'}`}>
                  {view.visibility === 'team' ? 'Team' : 'Personal'}
                </span>
                {user?.superAdmin ||
                String(typeof view.owner === 'object' ? view.owner?.id : view.owner) ===
                  String(user?.id) ? (
                  <button
                    type="button"
                    className="analyticsSavedViewDelete"
                    onClick={(e) => remove(e, view)}
                    aria-label={`Delete ${view.name}`}
                  >
                    <XIcon />
                  </button>
                ) : (
                  <span className="analyticsSavedViewDeleteSpacer" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CommandPalette({
  tabs = [],
  campaigns = [],
  templates = [],
  savedViews = [],
  onClose,
  onNavigate,
  onCampaign,
  onTemplate,
  onSavedView,
  onNewCampaign,
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (value) =>
    !q ||
    String(value || '')
      .toLowerCase()
      .includes(q)

  const navMatches = tabs.filter((item) => match(item)).slice(0, 6)
  const campaignMatches = campaigns
    .filter((item) => match(`${item.name} ${item.description} ${item.status}`))
    .slice(0, 6)
  const templateMatches = templates
    .filter((item) => match(`${item.name} ${item.key} ${item.family} ${item.theme}`))
    .slice(0, 6)
  const viewMatches = savedViews
    .filter((item) => match(`${item.name} ${item.tab} ${item.campaign} ${item.region}`))
    .slice(0, 5)
  const actions = [
    {
      id: 'new-campaign',
      label: 'Create a new campaign',
      hint: 'Campaign Builder',
      icon: <PlusIcon />,
      run: onNewCampaign,
    },
    {
      id: 'overview',
      label: 'Go to Overview',
      hint: 'Navigation',
      icon: <HomeIcon />,
      run: () => onNavigate?.('Overview'),
    },
    {
      id: 'alerts',
      label: 'Open Alerts',
      hint: 'Health',
      icon: <BellIcon />,
      run: () => onNavigate?.('Alerts'),
    },
  ].filter((item) => match(`${item.label} ${item.hint}`))

  const nothing =
    !navMatches.length &&
    !campaignMatches.length &&
    !templateMatches.length &&
    !viewMatches.length &&
    !actions.length

  return (
    <div
      className="analyticsCommandBackdrop no-print"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="analyticsCommandPalette"
        role="dialog"
        aria-modal="true"
        aria-label="Search analytics"
      >
        <div className="analyticsCommandSearch">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections, campaigns, templates or views…"
            autoFocus
          />
          <kbd>ESC</kbd>
        </div>
        <div className="analyticsCommandResults">
          {actions.length > 0 && (
            <CommandGroup
              title="Quick actions"
              items={actions.map((item) => ({ ...item, onClick: item.run }))}
            />
          )}
          {viewMatches.length > 0 && (
            <CommandGroup
              title="Saved views"
              items={viewMatches.map((item) => ({
                label: item.name,
                hint: `${item.tab} · ${item.days}d`,
                icon: <StarIcon />,
                onClick: () => onSavedView?.(item),
              }))}
            />
          )}
          {navMatches.length > 0 && (
            <CommandGroup
              title="Sections"
              items={navMatches.map((item) => ({
                label: item,
                hint: NAV_GROUPS.find((g) => g.items.includes(item))?.label || 'Analytics',
                icon: <NavIcon name={item} />,
                onClick: () => onNavigate?.(item),
              }))}
            />
          )}
          {campaignMatches.length > 0 && (
            <CommandGroup
              title="Campaigns"
              items={campaignMatches.map((item) => ({
                label: item.name,
                hint: `${item.status} · ${item.keys.length} templates`,
                icon: <SendIcon />,
                onClick: () => onCampaign?.(item.name),
              }))}
            />
          )}
          {templateMatches.length > 0 && (
            <CommandGroup
              title="Templates"
              items={templateMatches.map((item) => ({
                label: item.name,
                hint: `${item.family} · ${item.key}`,
                icon: <TemplateIcon />,
                onClick: () => onTemplate?.(item),
              }))}
            />
          )}
          {nothing && (
            <Empty>
              No result matches “{query}”. Try a campaign name, template family, region view or
              dashboard section.
            </Empty>
          )}
        </div>
        <div className="analyticsCommandFooter">
          <span>
            <kbd>⌘</kbd>
            <kbd>K</kbd> open search
          </span>
          <span>
            <kbd>ESC</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

function CommandGroup({ title, items }) {
  return (
    <section className="analyticsCommandGroup">
      <span>{title}</span>
      {items.map((item, index) => (
        <button type="button" key={`${title}-${item.label}-${index}`} onClick={item.onClick}>
          <i>{item.icon}</i>
          <div>
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </div>
          <ArrowRightIcon />
        </button>
      ))}
    </section>
  )
}

function NotificationsDrawer({ items = [], auditLogs = [], onClose, onNavigate }) {
  const [view, setView] = useState('notifications')
  return (
    <div
      className="analyticsDrawerBackdrop no-print"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <aside
        className="analyticsNotificationsDrawer"
        role="dialog"
        aria-modal="true"
        aria-label="Notifications and activity"
      >
        <div className="analyticsDrawerHeader">
          <div>
            <span className="analyticsIntelEyebrow">MARKETING OPERATIONS</span>
            <h2>Notifications & activity</h2>
          </div>
          <button
            type="button"
            className="analyticsModalClose"
            onClick={onClose}
            aria-label="Close notifications"
          >
            <XIcon />
          </button>
        </div>
        <div className="analyticsDrawerTabs">
          <button
            type="button"
            className={view === 'notifications' ? 'active' : ''}
            onClick={() => setView('notifications')}
          >
            <BellIcon /> Notifications <span>{items.length}</span>
          </button>
          <button
            type="button"
            className={view === 'activity' ? 'active' : ''}
            onClick={() => setView('activity')}
          >
            <ActivityIcon /> Activity <span>{auditLogs.length}</span>
          </button>
        </div>

        <div className="analyticsDrawerBody">
          {view === 'notifications' && (
            <div className="analyticsNotificationList">
              {items.length === 0 && (
                <Empty>
                  No active anomalies or data-quality warnings. This scope currently looks healthy.
                </Empty>
              )}
              {items.map((item) => (
                <button
                  type="button"
                  className={`analyticsNotificationItem ${item.severity}`}
                  key={item.id}
                  onClick={() => item.actionTab && onNavigate?.(item.actionTab)}
                >
                  <span className="analyticsNotificationItemIcon">
                    <AlertIcon />
                  </span>
                  <span className="analyticsNotificationItemCopy">
                    <small>{item.metric || item.category || 'Signal'}</small>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                    {item.confidence && (
                      <em>
                        {item.confidence.label} confidence · score {item.confidence.score}
                      </em>
                    )}
                  </span>
                  {item.actionTab && <ArrowRightIcon />}
                </button>
              ))}
            </div>
          )}

          {view === 'activity' && (
            <div className="analyticsAuditList">
              {auditLogs.length === 0 && (
                <Empty>No campaign or saved-view changes have been recorded yet.</Empty>
              )}
              {auditLogs.map((log) => (
                <div className="analyticsAuditItem" key={log.id}>
                  <span className={`analyticsAuditIcon action-${log.action || 'updated'}`}>
                    <ActivityIcon />
                  </span>
                  <div>
                    <strong>
                      {log.summary ||
                        `${log.actorName || 'User'} ${log.action || 'updated'} ${log.entityName || ''}`}
                    </strong>
                    <span>
                      {formatRelativeTime(log.createdAt)} · {log.entityType || 'analytics'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function KpiDrilldownModal({ metric, rows = [], campaigns = [], tplMap = {}, onClose }) {
  const config = KPI_DRILLDOWN_CONFIG[metric] || KPI_DRILLDOWN_CONFIG.sent
  const agg = sumRows(rows)
  const value = metricValueFromAgg(metric, agg)
  const confidence = confidenceForMetric(rows, metric)
  const breakdowns = buildKpiBreakdowns(metric, rows, campaigns, tplMap)
  const [dimension, setDimension] = useState('Campaign')
  const active = breakdowns[dimension] || []

  return (
    <div
      className="analyticsModalBackdrop no-print"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className="analyticsKpiDrilldown"
        role="dialog"
        aria-modal="true"
        aria-label={`${config.label} drill-down`}
      >
        <div className="analyticsBuilderHeader">
          <div>
            <span className="analyticsIntelEyebrow">KPI DRILL-DOWN</span>
            <h2>{config.label}</h2>
            <p>{config.explainer}</p>
          </div>
          <button
            type="button"
            className="analyticsModalClose"
            onClick={onClose}
            aria-label="Close KPI drill-down"
          >
            <XIcon />
          </button>
        </div>

        <div className="analyticsKpiDrillSummary">
          <div>
            <span>Current value</span>
            <strong>{formatMetric(metric, value)}</strong>
          </div>
          <div>
            <span>Rows in scope</span>
            <strong>{fmt(rows.length)}</strong>
          </div>
          <div>
            <span>Delivered volume</span>
            <strong>{fmt(agg.delivered)}</strong>
          </div>
          <DataConfidenceBadge confidence={confidence} />
        </div>

        <div className="analyticsKpiDimensionTabs">
          {Object.keys(breakdowns).map((item) => (
            <button
              type="button"
              key={item}
              className={dimension === item ? 'active' : ''}
              onClick={() => setDimension(item)}
            >
              {item}
            </button>
          ))}
        </div>

        {active.length ? (
          <>
            <div className="analyticsKpiDrillChart">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={active.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 4, right: 30, bottom: 4, left: 100 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: C.mid }}
                    unit={config.unit || ''}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10, fill: C.mid }}
                    width={95}
                  />
                  <Tooltip formatter={(v) => formatMetric(metric, Number(v))} />
                  <Bar dataKey="value" fill={config.color} radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="analyticsTableWrap">
              <table className="analyticsDataTable">
                <thead>
                  <tr>
                    <th>{dimension}</th>
                    <th>Value</th>
                    <th>Sent</th>
                    <th>Delivered</th>
                    <th>Share of delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {active.slice(0, 20).map((item) => (
                    <tr key={item.label}>
                      <td>
                        <strong>{item.label}</strong>
                      </td>
                      <td>
                        <strong style={{ color: config.color }}>
                          {formatMetric(metric, item.value)}
                        </strong>
                      </td>
                      <td>{fmt(item.agg.sent)}</td>
                      <td>{fmt(item.agg.delivered)}</td>
                      <td>{pctNum(item.agg.delivered, agg.delivered).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty>
            There is not enough data to break this KPI down by {dimension.toLowerCase()} in the
            selected scope.
          </Empty>
        )}

        <div className="analyticsMethodNote">
          <ConfidenceIcon />
          <span>
            {confidence.detail} Drill-downs describe contribution and association; they do not prove
            causality.
          </span>
        </div>
      </div>
    </div>
  )
}

const Screen = ({ children }) => <div className="analyticsLoadingScreen">{children}</div>

const Spinner = () => <div className="analyticsSpinner" aria-label="Loading" />

const Banner = ({ children }) => (
  <div className="analyticsWarning" role="alert">
    <AlertIcon />
    <span>{children}</span>
  </div>
)

const Empty = ({ children }) => (
  <div className="analyticsEmpty">
    <span className="analyticsEmptyIcon">
      <SearchIcon />
    </span>
    <span>{children}</span>
  </div>
)

const thR = {
  fontSize: 11,
  fontWeight: 700,
  padding: '10px 12px',
  textAlign: 'right',
  color: C.mid,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
}

const tdR = {
  fontSize: 12,
  padding: '10px 12px',
  textAlign: 'right',
  color: C.dark,
  borderBottom: `1px solid ${C.border}`,
  whiteSpace: 'nowrap',
}

function MiniStat({ label, value, detail, tone = 'blue', icon }) {
  return (
    <div className={`analyticsMiniStat analyticsMiniStat-${tone}`}>
      <div className="analyticsMiniStatIcon">{icon}</div>
      <div className="analyticsMiniStatCopy">
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </div>
  )
}

function InsightCard({ tone = 'blue', icon, title, text }) {
  return (
    <div className={`analyticsInsightCard analyticsInsightCard-${tone}`}>
      <div className="analyticsInsightIcon">{icon}</div>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  )
}

function StatusBadge({ label, tone = 'neutral' }) {
  return <span className={`analyticsStatusBadge analyticsStatusBadge-${tone}`}>{label}</span>
}

function MetricDelta({ value, suffix = 'pp' }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
    return <span className="analyticsMetricDelta neutral">≈</span>
  }
  const up = value > 0
  return (
    <span className={`analyticsMetricDelta ${up ? 'up' : 'down'}`}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}
      {suffix}
    </span>
  )
}

function HealthDimension({ label, value, target, good, max, inverse = false, digits = 1 }) {
  const normalized = Math.max(
    0,
    Math.min(100, inverse ? 100 - (value / max) * 100 : (value / max) * 100),
  )
  return (
    <div className="analyticsHealthDimension">
      <div className="analyticsHealthDimensionTop">
        <span>{label}</span>
        <strong className={good ? 'good' : 'bad'}>{value.toFixed(digits)}%</strong>
      </div>
      <div className="analyticsHealthTrack">
        <span className={good ? 'good' : 'bad'} style={{ width: `${normalized}%` }} />
      </div>
      <small>{target}</small>
    </div>
  )
}

function DeltaBadge({ delta, goodUp }) {
  if (!delta) return null

  if (delta.up === null) {
    return <span className="analyticsDelta neutral">{delta.txt}</span>
  }

  const isGood = goodUp ? delta.up : !delta.up

  return (
    <span className={`analyticsDelta ${isGood ? 'good' : 'bad'}`}>
      {delta.up ? '▲' : '▼'} {delta.txt}
    </span>
  )
}

function Filter({ label, value, set, opts, icon }) {
  return (
    <label className="analyticsFilter" title={label}>
      {icon && <span className="analyticsFilterIcon">{icon}</span>}
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDownIcon />
    </label>
  )
}

function Kpi({
  ico,
  label,
  val,
  clr,
  sub,
  delta,
  goodUp,
  spark,
  sparkKey,
  accent = 'blue',
  confidence,
  onClick,
}) {
  const interactive = typeof onClick === 'function'
  return (
    <div
      className={`analyticsKpi analyticsKpi-${accent} ${interactive ? 'interactive' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => (event.key === 'Enter' || event.key === ' ') && onClick()
          : undefined
      }
      aria-label={interactive ? `${label}. Open drill-down.` : undefined}
    >
      <div className="analyticsKpiTop">
        <div className="analyticsKpiIcon">{ico}</div>
        {confidence && (
          <span className={`analyticsKpiConfidence ${confidence.level}`} title={confidence.detail}>
            {confidence.label}
          </span>
        )}
      </div>

      <div className="analyticsKpiValueRow">
        <span className="analyticsKpiValue" style={{ color: clr }}>
          {val}
        </span>
        <DeltaBadge delta={delta} goodUp={goodUp} />
      </div>

      <div className="analyticsKpiLabel">{label}</div>
      {sub && <div className="analyticsKpiSub">{sub}</div>}
      {interactive && (
        <div className="analyticsKpiExplore">
          <span>Investigate</span>
          <ArrowRightIcon />
        </div>
      )}

      {spark?.length > 1 && sparkKey && (
        <div className="analyticsSparkline" aria-hidden="true">
          <ResponsiveContainer width="100%" height={34}>
            <LineChart data={spark} margin={{ top: 4, right: 1, left: 1, bottom: 1 }}>
              <Line
                type="monotone"
                dataKey={sparkKey}
                stroke={clr}
                strokeWidth={1.7}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Card({ title, sub, children, actions, className = '' }) {
  return (
    <section className={`analyticsCard ${className}`.trim()}>
      <div className="analyticsCardHeader">
        <div>
          <div className="analyticsCardTitle">{title}</div>
          {sub && <div className="analyticsCardSub">{sub}</div>}
        </div>
        {actions && <div className="analyticsCardActions">{actions}</div>}
      </div>
      <div className="analyticsCardBody">{children}</div>
    </section>
  )
}

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="analyticsTooltip">
      <div className="analyticsTooltipLabel">{label}</div>
      {payload.map((item) => (
        <div className="analyticsTooltipRow" key={item.dataKey}>
          <span className="analyticsTooltipDot" style={{ background: item.color }} />
          <span>{item.name}</span>
          <strong>{fmt(item.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function AnalyticsFeatureStrip() {
  const features = [
    [<ShieldIcon key="s" />, 'Secure & Reliable', 'Enterprise-grade data protection'],
    [<BoltIcon key="b" />, 'Real-time Updates', 'Metrics refresh as new data arrives'],
    [<UsersIcon key="u" />, 'Built for Your Team', 'One view for marketing performance'],
    [<MailIcon key="m" />, 'Deliverability Health', 'Monitor inbox placement signals'],
  ]

  return (
    <div className="analyticsFeatureStrip no-print">
      {features.map(([icon, title, text]) => (
        <div className="analyticsFeature" key={title}>
          <div className="analyticsFeatureIcon">{icon}</div>
          <div>
            <strong>{title}</strong>
            <span>{text}</span>
          </div>
          <ArrowRightIcon />
        </div>
      ))}
    </div>
  )
}

function BreakdownBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.mid }} />
        <YAxis tick={{ fontSize: 11, fill: C.mid }} unit="%" />
        <Tooltip content={<AnalyticsTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="open" fill={C.green} name="Open rate %" radius={[4, 4, 0, 0]} />
        <Bar dataKey="ctr" fill={C.purple} name="CTR %" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
function LeaderTable({ groups, nameKey }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ ...thR, textAlign: 'left' }}>{nameKey ? 'Region' : 'Template'}</th>
            {['Sent', 'Deliv %', 'Open %', 'CTR %', 'CTOR %', 'Complaints', 'Unsub'].map((h) => (
              <th key={h} style={thR}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td
                colSpan={8}
                style={{ textAlign: 'center', padding: 24, color: C.mid, fontSize: 13 }}
              >
                No data
              </td>
            </tr>
          )}
          {groups.map((g, i) => {
            const open = pctNum(g.uniqueOpens, g.delivered),
              ctr = pctNum(g.uniqueClicks, g.delivered),
              ctor = pctNum(g.uniqueClicks, g.uniqueOpens)
            return (
              <tr key={i} style={{ background: i % 2 ? C.bg : C.white }}>
                <td style={{ ...tdR, textAlign: 'left', fontWeight: 600 }}>{g.label}</td>
                <td style={tdR}>{fmt(g.sent)}</td>
                <td style={tdR}>{pctStr(g.delivered, g.sent)}</td>
                <td style={{ ...tdR, color: rateColor(open), fontWeight: 700 }}>
                  {open.toFixed(1)}%
                </td>
                <td style={{ ...tdR, color: C.purple, fontWeight: 600 }}>{ctr.toFixed(1)}%</td>
                <td style={tdR}>{ctor.toFixed(1)}%</td>
                <td style={{ ...tdR, color: g.complaints > 0 ? C.amber : C.mid }}>
                  {fmt(g.complaints)}
                </td>
                <td style={tdR}>{fmt(g.unsubscribes)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------------------------------------------------------- Icons */

const IconSvg = ({ children, size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
)

function NavIcon({ name }) {
  if (name === 'Overview') return <HomeIcon />
  if (name === 'Executive') return <SparkleIcon />
  if (name === 'Campaigns') return <SendIcon />
  if (name === 'Templates') return <TemplateIcon />
  if (name === 'Audience') return <GlobeIcon />
  if (name === 'Channels') return <ChannelsIcon />
  if (name === 'Timing') return <ClockIcon />
  if (name === 'Journeys') return <JourneyIcon />
  if (name === 'Deliverability') return <DeliverabilityIcon />
  if (name === 'Alerts') return <BellIcon />
  return <DataQualityIcon />
}

function HomeIcon() {
  return (
    <IconSvg>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
      <path d="M9 20v-6h6v6" />
    </IconSvg>
  )
}
function SendIcon() {
  return (
    <IconSvg>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </IconSvg>
  )
}
function TemplateIcon() {
  return (
    <IconSvg>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </IconSvg>
  )
}
function ChannelsIcon() {
  return (
    <IconSvg>
      <path d="M8.5 5.5a5 5 0 0 0 0 7M15.5 5.5a5 5 0 0 1 0 7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M5.5 2.5a9 9 0 0 0 0 19M18.5 2.5a9 9 0 0 1 0 19" />
    </IconSvg>
  )
}
function ClockIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconSvg>
  )
}
function JourneyIcon() {
  return (
    <IconSvg>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6h4a4 4 0 0 1 4 4v1" />
      <path d="m13 9 3 3 3-3" />
      <path d="M16 14v1a3 3 0 0 0 2 3" />
    </IconSvg>
  )
}
function DeliverabilityIcon() {
  return (
    <IconSvg>
      <path d="M4 4h16v16H4z" />
      <path d="m7 15 3-3 2 2 5-6" />
    </IconSvg>
  )
}
function DataQualityIcon() {
  return (
    <IconSvg>
      <path d="M4 4h16v16H4z" />
      <path d="M8 9h8M8 13h5" />
      <path d="m14 17 2 2 4-5" />
    </IconSvg>
  )
}
function GlobeIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </IconSvg>
  )
}
function BellIcon() {
  return (
    <IconSvg>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </IconSvg>
  )
}
function GridIcon() {
  return (
    <IconSvg>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
    </IconSvg>
  )
}
function LogoutIcon() {
  return (
    <IconSvg>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </IconSvg>
  )
}
function SunIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </IconSvg>
  )
}
function MoonIcon() {
  return (
    <IconSvg>
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z" />
    </IconSvg>
  )
}
function CalendarIcon() {
  return (
    <IconSvg size={16}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </IconSvg>
  )
}
function ChevronDownIcon() {
  return (
    <IconSvg size={14}>
      <path d="m6 9 6 6 6-6" />
    </IconSvg>
  )
}
function DownloadIcon() {
  return (
    <IconSvg size={16}>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </IconSvg>
  )
}
function CopyIcon() {
  return (
    <IconSvg size={16}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </IconSvg>
  )
}
function SearchIcon() {
  return (
    <IconSvg size={16}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </IconSvg>
  )
}
function ArrowRightIcon() {
  return (
    <IconSvg size={16}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </IconSvg>
  )
}
function PlusIcon() {
  return (
    <IconSvg size={16}>
      <path d="M12 5v14M5 12h14" />
    </IconSvg>
  )
}
function XIcon() {
  return (
    <IconSvg size={16}>
      <path d="m6 6 12 12M18 6 6 18" />
    </IconSvg>
  )
}
function ArrowLeftIcon() {
  return (
    <IconSvg size={16}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </IconSvg>
  )
}
function SparkleIcon() {
  return (
    <IconSvg size={19}>
      <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z" />
    </IconSvg>
  )
}
function MailIcon() {
  return (
    <IconSvg>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </IconSvg>
  )
}
function CheckIcon() {
  return (
    <IconSvg>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="m7 12 3 3 7-7" />
    </IconSvg>
  )
}
function EyeIcon() {
  return (
    <IconSvg>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconSvg>
  )
}
function PointerIcon() {
  return (
    <IconSvg>
      <path d="m5 3 11 9-5 1 3 6-3 1.5-3-6-3 4Z" />
    </IconSvg>
  )
}
function TargetIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M22 12h-3" />
    </IconSvg>
  )
}
function FlagIcon() {
  return (
    <IconSvg>
      <path d="M5 21V4" />
      <path d="M5 5h12l-2 4 2 4H5" />
    </IconSvg>
  )
}
function BounceIcon() {
  return (
    <IconSvg>
      <path d="M9 7H5v4" />
      <path d="M5 11a7 7 0 1 1 2 5" />
    </IconSvg>
  )
}
function BanIcon() {
  return (
    <IconSvg>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </IconSvg>
  )
}
function TrendIcon() {
  return (
    <IconSvg size={16}>
      <path d="M3 17 9 11l4 4 8-9" />
    </IconSvg>
  )
}
function BarsIcon() {
  return (
    <IconSvg size={16}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </IconSvg>
  )
}
function AlertIcon() {
  return (
    <IconSvg size={17}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </IconSvg>
  )
}
function StarIcon() {
  return (
    <IconSvg size={16}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
    </IconSvg>
  )
}
function EditIcon() {
  return (
    <IconSvg size={16}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </IconSvg>
  )
}
function ArchiveIcon() {
  return (
    <IconSvg size={16}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11h14V8M9 12h6" />
    </IconSvg>
  )
}
function RestoreIcon() {
  return (
    <IconSvg size={16}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </IconSvg>
  )
}
function ActivityIcon() {
  return (
    <IconSvg size={16}>
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </IconSvg>
  )
}
function ConfidenceIcon() {
  return (
    <IconSvg size={16}>
      <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </IconSvg>
  )
}
function ShieldIcon() {
  return (
    <IconSvg>
      <path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </IconSvg>
  )
}
function BoltIcon() {
  return (
    <IconSvg>
      <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />
    </IconSvg>
  )
}
function UsersIcon() {
  return (
    <IconSvg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </IconSvg>
  )
}

/* ---------------------------------------------------------------- Export */

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .print-only { display: block !important; }
  .print-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
  @page { size: A4 landscape; margin: 12mm; }
}
.print-only { display: none; }
`

// Rendered only on paper: the filters that produced the report, since the
// filter bar itself is hidden when printing.
function PrintHeader({ meta, tab }) {
  return (
    <div
      className="print-only"
      style={{ marginBottom: 14, borderBottom: `2px solid ${C.dark}`, paddingBottom: 8 }}
    >
      <div style={{ fontSize: 18, fontWeight: 800 }}>Marketing Analytics — {tab}</div>
      <div style={{ fontSize: 11, color: C.mid, marginTop: 3 }}>
        Last {meta.days} days · Campaign: {meta.campaign} · Channel: {meta.channel} · Region:{' '}
        {meta.region} · Generated {new Date().toLocaleString('en-GB')}
      </div>
    </div>
  )
}

function ExportMenu({ rows, agg, aggPrev, tplMap, campaigns, meta }) {
  const [open, setOpen] = useState(false)
  const run = (fn) => () => {
    setOpen(false)
    fn()
  }

  const templateGroups = () => {
    const map = new Map()
    for (const r of rows) {
      const name =
        (tplMap[r.templateKey] && tplMap[r.templateKey].name) ||
        r.templateName ||
        r.templateKey ||
        '—'
      if (!map.has(name)) map.set(name, [])
      map.get(name).push(r)
    }
    return [...map.entries()]
      .map(([label, list]) => ({ label, ...sumRows(list) }))
      .sort((a, b) => b.sent - a.sent)
  }
  const campaignGroups = () =>
    campaigns
      .map((c) => {
        const keys = new Set(c.keys)
        return { label: c.name, ...sumRows(rows.filter((r) => keys.has(r.templateKey))) }
      })
      .sort((a, b) => b.sent - a.sent)

  const items = [
    ['Summary (CSV)', () => exportSummary(agg, aggPrev, meta)],
    [
      'Templates (CSV)',
      () => exportGroups(templateGroups(), 'Template', { ...meta, tab: 'templates' }),
    ],
    [
      'Campaigns (CSV)',
      () => exportGroups(campaignGroups(), 'Campaign', { ...meta, tab: 'campaigns' }),
    ],
    [
      'Regions (CSV)',
      () => exportGroups(groupBy(rows, 'region', 'region'), 'Region', { ...meta, tab: 'regions' }),
    ],
    ['Daily rows (CSV)', () => exportDailyRows(rows, meta)],
    ['Print / Save as PDF', () => window.print()],
  ]

  return (
    <div className="analyticsExport no-print">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!rows.length}
        className="analyticsExportButton"
      >
        <DownloadIcon />
        <span>Export</span>
        <ChevronDownIcon />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="analyticsExportBackdrop"
            onClick={() => setOpen(false)}
            aria-label="Close export menu"
          />
          <div className="analyticsExportMenu">
            {items.map(([label, fn], i) => (
              <button
                type="button"
                key={label}
                onClick={run(fn)}
                className={i === items.length - 1 ? 'printAction' : ''}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Timing */

// Send-time heatmap utilities.
function heatColor(v, max) {
  if (!max || !v) return C.bg
  // Perceptually simple ramp: light blue tint -> brand green at the peak.
  const t = Math.sqrt(v / max) // sqrt so mid-range cells stay readable
  const from = [230, 240, 247] // C.blueLight
  const to = [106, 173, 73] // C.greenDark
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

const hh = (h) => String(h).padStart(2, '0') + ':00'

function TimingMetricPicker({ metric, setMetric }) {
  return (
    <div className="analyticsSegmentRow no-print">
      {[
        ['openRate', 'Open rate'],
        ['ctr', 'CTR'],
        ['delivered', 'Delivered volume'],
      ].map(([value, label]) => (
        <button
          type="button"
          key={value}
          onClick={() => setMetric(value)}
          className={`analyticsSegmentButton ${metric === value ? 'active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TimingTab({ events, current }) {
  const [metric, setMetric] = useState('openRate')

  if (events === null) {
    return (
      <Card
        title="Best send time"
        sub="Loading delivered/open/click events for send-time attribution…"
      >
        <Spinner />
      </Card>
    )
  }

  const label = metric === 'ctr' ? 'CTR' : metric === 'openRate' ? 'Open rate' : 'Delivered'

  if (!events.length) {
    const fallback = buildDowPerformanceFromRows(current)
    const values = fallback.map((item) => (metric === 'delivered' ? item.delivered : item[metric]))
    const max = Math.max(0, ...values)
    const bestIndex = values.indexOf(max)

    return (
      <>
        <div className="analyticsIntelHeader">
          <div>
            <span className="analyticsIntelEyebrow">SEND-TIME INTELLIGENCE</span>
            <h2>When does historical performance peak?</h2>
            <p>
              Raw message-level events are not available in this range yet, so the dashboard is
              showing day-of-week performance from the daily send rollup instead of pretending to
              know the best hour.
            </p>
          </div>
        </div>

        <Card
          title="Day-of-week performance"
          sub="Fallback view from analytics-daily · hourly attribution requires raw delivered/open/click events"
        >
          <TimingMetricPicker metric={metric} setMetric={setMetric} />
          <Banner>
            Hourly send-time analysis is unavailable for this range. The daily rollup can support a
            reliable day-of-week view, but not hour-of-day attribution.
          </Banner>
          <div className="analyticsDowHeatmap">
            {fallback.map((item, index) => {
              const value = values[index]
              const text = metric === 'delivered' ? fmt(value) : `${value.toFixed(1)}%`
              return (
                <div className="analyticsDowHeatCell" key={item.day}>
                  <div style={{ background: heatColor(value, max) }}>
                    <strong>{text}</strong>
                  </div>
                  <span>{item.day}</span>
                  <small>{fmt(item.delivered)} delivered</small>
                </div>
              )
            })}
          </div>
          <div className="analyticsTimingConclusion">
            <ClockIcon />
            <span>
              Best day for <strong>{label.toLowerCase()}</strong>:{' '}
              <strong>{DOW[Math.max(0, bestIndex)]}</strong>
              {metric !== 'delivered' && fallback[bestIndex]
                ? ` · ${values[bestIndex].toFixed(1)}%`
                : ''}
              .
            </span>
          </div>
        </Card>
      </>
    )
  }

  const attribution = buildSendTimeAttribution(events)
  const grid = attribution.grid
  const flat = grid.flat()
  const metricValue = (cell) => (metric === 'delivered' ? cell.delivered : cell[metric])
  const values = flat.map(metricValue)
  const max = Math.max(0, ...values)
  const qualified = flat.filter((cell) => cell.delivered >= 10)
  const candidates = qualified.length ? qualified : flat.filter((cell) => cell.delivered > 0)
  const bestCell = [...candidates].sort((a, b) => metricValue(b) - metricValue(a))[0]

  const byDay = DOW.map((day, d) => {
    const cells = grid[d]
    const delivered = cells.reduce((sum, cell) => sum + cell.delivered, 0)
    const opens = cells.reduce((sum, cell) => sum + cell.opens, 0)
    const clicks = cells.reduce((sum, cell) => sum + cell.clicks, 0)
    return { day, delivered, openRate: pctNum(opens, delivered), ctr: pctNum(clicks, delivered) }
  })
  const bestDay = [...byDay]
    .filter((item) => item.delivered > 0)
    .sort((a, b) => (metric === 'delivered' ? b.delivered - a.delivered : b[metric] - a[metric]))[0]
  const matchRate = pctNum(attribution.attributed, attribution.identities)

  return (
    <>
      <div className="analyticsIntelHeader">
        <div>
          <span className="analyticsIntelEyebrow">SEND-TIME INTELLIGENCE</span>
          <h2>Best historical send windows</h2>
          <p>
            Engagement is assigned back to the hour of the matched delivered event using recipient +
            message/notification identity. This measures send-window performance rather than the
            hour when somebody happened to open or click.
          </p>
        </div>
        <div className={`analyticsCoveragePill ${matchRate < 80 ? 'warning' : ''}`}>
          <span>Attribution coverage</span>
          <strong>{matchRate.toFixed(0)}%</strong>
        </div>
      </div>

      <div className="analyticsMiniStatGrid">
        <MiniStat
          label={`Best ${label.toLowerCase()} slot`}
          value={bestCell ? `${DOW[bestCell.d]} ${hh(bestCell.h)}` : '—'}
          detail={
            bestCell
              ? `${metric === 'delivered' ? fmt(bestCell.delivered) : `${metricValue(bestCell).toFixed(1)}%`} · ${fmt(bestCell.delivered)} delivered`
              : 'No attributed delivery events'
          }
          tone="green"
          icon={<ClockIcon />}
        />
        <MiniStat
          label="Best day overall"
          value={bestDay?.day || '—'}
          detail={
            bestDay
              ? `${metric === 'delivered' ? fmt(bestDay.delivered) : `${bestDay[metric].toFixed(1)}%`} ${label.toLowerCase()}`
              : 'No data'
          }
          tone="blue"
          icon={<CalendarIcon />}
        />
        <MiniStat
          label="Attributed deliveries"
          value={fmt(attribution.attributed)}
          detail={`${fmt(attribution.identities)} message-recipient identities observed`}
          tone="purple"
          icon={<TargetIcon />}
        />
        <MiniStat
          label="Unmatched events"
          value={fmt(attribution.unmatchedEvents)}
          detail="Events missing a usable message/recipient identity"
          tone={attribution.unmatchedEvents ? 'amber' : 'green'}
          icon={<AlertIcon />}
        />
      </div>

      <Card
        title="7 × 24 send-time heatmap"
        sub={`${label} by delivered-event send window · viewer local time · cells with fewer than 10 delivered messages are excluded from best-slot ranking when possible`}
      >
        <TimingMetricPicker metric={metric} setMetric={setMetric} />
        <div className="analyticsHeatmapWrap">
          <table className="analyticsHeatmapTable">
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h}>{h % 2 === 0 ? String(h).padStart(2, '0') : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={DOW[d]}>
                  <td>{DOW[d]}</td>
                  {row.map((cell, h) => {
                    const value = metricValue(cell)
                    const display = metric === 'delivered' ? fmt(value) : `${value.toFixed(1)}%`
                    return (
                      <td key={h}>
                        <div
                          className={`analyticsHeatCell ${cell.delivered > 0 ? 'hasData' : ''}`}
                          style={{ background: heatColor(value, max) }}
                          title={`${DOW[d]} ${hh(h)} · ${display} ${label.toLowerCase()} · ${fmt(cell.delivered)} delivered · ${fmt(cell.opens)} opened · ${fmt(cell.clicks)} clicked`}
                        >
                          {cell.delivered >= 10 && (
                            <span>{metric === 'delivered' ? fmt(value) : value.toFixed(0)}</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="analyticsHeatLegend">
          <span>Low</span>
          {[0.08, 0.22, 0.4, 0.6, 0.8, 1].map((t) => (
            <i key={t} style={{ background: heatColor(t * max, max) }} />
          ))}
          <span>High</span>
          {bestCell && (
            <strong>
              Peak: {DOW[bestCell.d]} {hh(bestCell.h)} ·{' '}
              {metric === 'delivered'
                ? fmt(bestCell.delivered)
                : `${metricValue(bestCell).toFixed(1)}%`}
            </strong>
          )}
        </div>
      </Card>

      <Card
        title="Day-of-week benchmark"
        sub="Aggregated from the same message-level send-time attribution"
      >
        <div className="analyticsTimingDayGrid">
          {byDay.map((item) => (
            <div key={item.day} className={bestDay?.day === item.day ? 'best' : ''}>
              <span>{item.day}</span>
              <strong>
                {metric === 'delivered' ? fmt(item.delivered) : `${item[metric].toFixed(1)}%`}
              </strong>
              <small>{fmt(item.delivered)} delivered</small>
            </div>
          ))}
        </div>
      </Card>

      <div className="analyticsMethodNote">
        <AlertIcon />
        <span>
          This is historical association, not a causal recommendation. Audience mix, campaign type,
          timezone and content can all influence the apparent best window. Use the heatmap as a test
          hypothesis and validate with controlled scheduling experiments.
        </span>
      </div>
    </>
  )
}

function buildSendTimeAttribution(events) {
  const identities = new Map()
  let unmatchedEvents = 0

  for (const event of events) {
    const providerId = event.messageId || event.notificationId || event.templateKey
    const recipient = event.recipient
    if (!providerId || !recipient) {
      unmatchedEvents += 1
      continue
    }
    const key = `${event.channel || ''}|${providerId}|${recipient}`
    if (!identities.has(key))
      identities.set(key, { deliveredAt: null, opened: false, clicked: false })
    const item = identities.get(key)
    if (event.eventType === 'delivered') {
      const ts = new Date(event.timestamp).getTime()
      if (Number.isFinite(ts) && (!item.deliveredAt || ts < item.deliveredAt)) item.deliveredAt = ts
    } else if (event.eventType === 'opened') {
      item.opened = true
    } else if (event.eventType === 'clicked') {
      item.clicked = true
    }
  }

  const grid = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => ({
      d,
      h,
      delivered: 0,
      opens: 0,
      clicks: 0,
      openRate: 0,
      ctr: 0,
    })),
  )
  let attributed = 0
  for (const item of identities.values()) {
    if (!item.deliveredAt) continue
    const date = new Date(item.deliveredAt)
    const d = (date.getDay() + 6) % 7
    const h = date.getHours()
    const cell = grid[d][h]
    cell.delivered += 1
    if (item.opened) cell.opens += 1
    if (item.clicked) cell.clicks += 1
    attributed += 1
  }

  for (const row of grid) {
    for (const cell of row) {
      cell.openRate = pctNum(cell.opens, cell.delivered)
      cell.ctr = pctNum(cell.clicks, cell.delivered)
    }
  }

  return { grid, attributed, identities: identities.size, unmatchedEvents }
}

function buildDowPerformanceFromRows(rows) {
  const out = DOW.map((day) => ({
    day,
    sent: 0,
    delivered: 0,
    opens: 0,
    clicks: 0,
    openRate: 0,
    ctr: 0,
  }))
  for (const row of rows) {
    const date = new Date(row.date)
    if (Number.isNaN(date.getTime())) continue
    const index = (date.getDay() + 6) % 7
    out[index].sent += row.sent || 0
    out[index].delivered += row.delivered || 0
    out[index].opens += row.uniqueOpens || 0
    out[index].clicks += row.uniqueClicks || 0
  }
  for (const item of out) {
    item.openRate = pctNum(item.opens, item.delivered)
    item.ctr = pctNum(item.clicks, item.delivered)
  }
  return out
}
