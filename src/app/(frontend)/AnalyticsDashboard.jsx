'use client'
import { useState, useEffect, useMemo } from 'react'
import { LOGO_B64 } from './Dashboard'
import { exportDailyRows, exportGroups, exportSummary } from '@/lib/analytics/exportReport'
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
  blue: '#075c8f',
  blueLight: '#e6f0f7',
  dark: '#404041',
  bg: '#f2f2f2',
  white: '#ffffff',
  border: '#e5e7eb',
  mid: '#6b7280',
  red: '#dc2626',
  amber: '#d97706',
  purple: '#7c3aed',
  greenTxt: '#16a34a',
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

const dayMs = 86400000

const TABS = ['Overview', 'Campaigns', 'Templates', 'Channels', 'Timing', 'Deliverability']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function AnalyticsDashboard({ user, onBack, onLogout }) {
  const [rows, setRows] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [tplMap, setTplMap] = useState({})
  const [err, setErr] = useState('')
  const [days, setDays] = useState(90)
  const [channel, setChannel] = useState('All')
  const [region, setRegion] = useState('All')
  const [campaign, setCampaign] = useState('All')
  const [tab, setTab] = useState('Overview')
  const [events, setEvents] = useState(null) // lazily loaded, Timing tab only

  useEffect(() => {
    ;(async () => {
      try {
        const [rr, cr, tm] = await Promise.all([
          fetch(`${API}/analytics-daily?limit=10000&depth=0&sort=date`, {
            credentials: 'include',
          }).then((r) => r.json()),
          fetch(`${API}/campaigns?limit=200&depth=1`, { credentials: 'include' }).then((r) =>
            r.json(),
          ),
          fetch(`${API}/template-mappings?limit=5000&depth=0`, { credentials: 'include' }).then(
            (r) => r.json(),
          ),
        ])
        setRows(rr?.docs || [])
        const map = {}
        for (const t of tm?.docs || [])
          map[t.templateKey] = { family: t.family || t.templateName, name: t.templateName }
        setTplMap(map)
        setCampaigns(
          (cr?.docs || []).map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            keys: (c.templates || [])
              .map((t) => (typeof t === 'object' ? t.templateKey : null))
              .filter(Boolean),
          })),
        )
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

  const campaignKeys = useMemo(() => {
    const c = campaigns.find((x) => x.name === campaign)
    return c ? new Set(c.keys) : null
  }, [campaigns, campaign])

  const weekly = days > 92 // group charts by week for long ranges

  const { current, previous } = useMemo(() => {
    if (!rows) return { current: [], previous: [] }
    const now = Date.now()
    const curStart = now - days * dayMs
    const prevStart = now - 2 * days * dayMs
    const pass = (r) =>
      (channel === 'All' || r.channel === channel) &&
      (region === 'All' || r.region === region) &&
      (!campaignKeys || campaignKeys.has(r.templateKey))
    const cur = [],
      prev = []
    for (const r of rows) {
      if (!pass(r)) continue
      const t = new Date(r.date).getTime()
      if (t >= curStart) cur.push(r)
      else if (t >= prevStart) prev.push(r)
    }
    return { current: cur, previous: prev }
  }, [rows, days, channel, region, campaignKeys])

  const agg = useMemo(() => sumRows(current), [current])
  const aggPrev = useMemo(() => sumRows(previous), [previous])
  const regions = useMemo(
    () => [...new Set((rows || []).map((r) => r.region))].filter(Boolean).sort(),
    [rows],
  )

  if (rows === null)
    return (
      <Screen>
        <Spinner />
      </Screen>
    )

  const complaintRate = pctNum(agg.complaints, agg.delivered)
  const bounceRate = pctNum(agg.hardBounces + agg.softBounces, agg.sent)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui', color: C.dark }}>
      <style>{PRINT_CSS}</style>
      <div
        className="no-print"
        style={{
          background: C.dark,
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src={`data:image/svg+xml;base64,${LOGO_B64}`}
            alt="easyMarkets"
            style={{ height: 26 }}
          />
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Marketing Analytics</div>
          <span
            style={{
              fontSize: 11,
              color: '#9ca3af',
              background: 'rgba(255,255,255,.08)',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            Global · all campaigns
          </span>
        </div>
        <div
          style={{ fontSize: 12, color: '#c2c5cc', display: 'flex', gap: 12, alignItems: 'center' }}
        >
          {onBack && (
            <button onClick={onBack} style={hdrBtn}>
              ← Apps
            </button>
          )}
          <span>{user.name}</span>
          <button onClick={onLogout} style={hdrBtn}>
            Sign out
          </button>
        </div>
      </div>

      <div
        className="no-print"
        style={{
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          padding: '0 22px',
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              padding: '14px 16px',
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              color: tab === t ? C.blue : C.mid,
              cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${C.blue}` : '2px solid transparent',
              whiteSpace: 'nowrap',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px' }}>
        {err && <Banner>{err}</Banner>}

        <PrintHeader meta={{ days, channel, region, campaign }} tab={tab} />

        <div
          className="no-print"
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 18,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Filter
            label="Range"
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
          <span style={{ fontSize: 11, color: C.mid, marginLeft: 'auto' }}>
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

        {tab === 'Overview' && (
          <Overview
            agg={agg}
            aggPrev={aggPrev}
            current={current}
            complaintRate={complaintRate}
            bounceRate={bounceRate}
            weekly={weekly}
            campaigns={campaigns}
          />
        )}
        {tab === 'Campaigns' && <CampaignsTab current={current} campaigns={campaigns} />}
        {tab === 'Templates' && <TemplatesTab current={current} tplMap={tplMap} />}
        {tab === 'Channels' && <Channels current={current} />}
        {tab === 'Timing' && <TimingTab events={events} current={current} />}
        {tab === 'Deliverability' && (
          <Deliverability
            current={current}
            agg={agg}
            complaintRate={complaintRate}
            bounceRate={bounceRate}
            weekly={weekly}
          />
        )}

        <div className="no-print" style={{ textAlign: 'center', fontSize: 11, color: C.mid, padding: '8px 0 24px' }}>
          Showing mock data · live Mailgun/OneSignal feed connects next.
        </div>
      </div>
    </div>
  )
}

function Overview({ agg, aggPrev, current, complaintRate, bounceRate, weekly, campaigns }) {
  const openNow = pctNum(agg.uniqueOpens, agg.delivered),
    openPrev = pctNum(aggPrev.uniqueOpens, aggPrev.delivered)
  const ctrNow = pctNum(agg.uniqueClicks, agg.delivered),
    ctrPrev = pctNum(aggPrev.uniqueClicks, aggPrev.delivered)
  const trend = buildTrend(current, weekly)
  const summary = buildSummary(agg, aggPrev, current)
  return (
    <>
      {summary && (
        <div
          style={{
            background: C.blueLight,
            border: `1px solid ${C.blue}22`,
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: C.dark,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: C.blue }}>Summary ·</strong> {summary}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))',
          gap: 12,
          marginBottom: 22,
        }}
      >
        <Kpi
          ico="📤"
          label="Sent"
          val={fmt(agg.sent)}
          clr={C.blue}
          delta={relDelta(agg.sent, aggPrev.sent)}
          goodUp
        />
        <Kpi
          ico="✅"
          label="Delivery rate"
          val={pctStr(agg.delivered, agg.sent)}
          clr={C.greenTxt}
          delta={ppDelta(pctNum(agg.delivered, agg.sent), pctNum(aggPrev.delivered, aggPrev.sent))}
          goodUp
        />
        <Kpi
          ico="👁"
          label="Open rate"
          val={pctStr(agg.uniqueOpens, agg.delivered)}
          clr={C.green}
          delta={ppDelta(openNow, openPrev)}
          goodUp
          sub={`${fmt(agg.uniqueOpens)} unique`}
        />
        <Kpi
          ico="🖱"
          label="CTR"
          val={pctStr(agg.uniqueClicks, agg.delivered)}
          clr={C.purple}
          delta={ppDelta(ctrNow, ctrPrev)}
          goodUp
        />
        <Kpi
          ico="🎯"
          label="CTOR"
          val={pctStr(agg.uniqueClicks, agg.uniqueOpens)}
          clr={C.purple}
          delta={ppDelta(
            pctNum(agg.uniqueClicks, agg.uniqueOpens),
            pctNum(aggPrev.uniqueClicks, aggPrev.uniqueOpens),
          )}
          goodUp
          sub="clicks / opens"
        />
        <Kpi
          ico="🚩"
          label="Complaint rate"
          val={complaintRate.toFixed(3) + '%'}
          clr={complaintRate > 0.1 ? C.red : C.greenTxt}
          delta={ppDelta(complaintRate, pctNum(aggPrev.complaints, aggPrev.delivered), 3)}
          goodUp={false}
          sub="target < 0.1%"
        />
        <Kpi
          ico="↩️"
          label="Bounce rate"
          val={pctStr(agg.hardBounces + agg.softBounces, agg.sent)}
          clr={bounceRate > 5 ? C.red : C.mid}
          delta={ppDelta(
            bounceRate,
            pctNum(aggPrev.hardBounces + aggPrev.softBounces, aggPrev.sent),
          )}
          goodUp={false}
        />
        <Kpi
          ico="🚫"
          label="Unsub rate"
          val={pctStr(agg.unsubscribes, agg.delivered)}
          clr={C.amber}
          delta={ppDelta(
            pctNum(agg.unsubscribes, agg.delivered),
            pctNum(aggPrev.unsubscribes, aggPrev.delivered),
          )}
          goodUp={false}
        />
      </div>
      <Card
        title="Engagement over time"
        sub={`Delivered vs unique opens vs clicks${weekly ? ' · by week' : ''}`}
      >
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: C.mid }} />
            <YAxis tick={{ fontSize: 11, fill: C.mid }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="delivered"
              stroke={C.blue}
              strokeWidth={2}
              dot={false}
              name="Delivered"
            />
            <Line
              type="monotone"
              dataKey="opens"
              stroke={C.green}
              strokeWidth={2}
              dot={false}
              name="Unique opens"
            />
            <Line
              type="monotone"
              dataKey="clicks"
              stroke={C.purple}
              strokeWidth={2}
              dot={false}
              name="Unique clicks"
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </>
  )
}

function CampaignsTab({ current, campaigns }) {
  if (!campaigns.length)
    return (
      <Card title="Campaigns" sub="">
        <Empty>
          No campaigns yet. Create one in the Payload admin (/admin → Campaigns) and assign
          templates to it.
        </Empty>
      </Card>
    )
  const groups = campaigns
    .map((c) => {
      const keys = new Set(c.keys)
      const rows = current.filter((r) => keys.has(r.templateKey))
      return { label: c.name, color: c.color, templateCount: c.keys.length, ...sumRows(rows) }
    })
    .sort((a, b) => pctNum(b.uniqueOpens, b.delivered) - pctNum(a.uniqueOpens, a.delivered))

  return (
    <>
      <Card title="Campaign performance" sub="Each campaign aggregates all its assigned templates">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={groups.map((g) => ({
              name: g.label,
              open: +pctNum(g.uniqueOpens, g.delivered).toFixed(1),
              ctr: +pctNum(g.uniqueClicks, g.delivered).toFixed(1),
            }))}
            margin={{ top: 6, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.mid }} />
            <YAxis tick={{ fontSize: 11, fill: C.mid }} unit="%" />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="open" fill={C.green} name="Open rate %" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ctr" fill={C.purple} name="CTR %" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Campaign leaderboard" sub="Sorted by open rate">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...thR, textAlign: 'left' }}>Campaign</th>
                {['Templates', 'Sent', 'Deliv %', 'Open %', 'CTR %', 'CTOR %', 'Unsub'].map((h) => (
                  <th key={h} style={thR}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => {
                const open = pctNum(g.uniqueOpens, g.delivered)
                return (
                  <tr key={i} style={{ background: i % 2 ? C.bg : C.white }}>
                    <td style={{ ...tdR, textAlign: 'left', fontWeight: 700 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: g.color || C.mid,
                          marginRight: 7,
                        }}
                      />
                      {g.label}
                    </td>
                    <td style={tdR}>{g.templateCount}</td>
                    <td style={tdR}>{fmt(g.sent)}</td>
                    <td style={tdR}>{pctStr(g.delivered, g.sent)}</td>
                    <td style={{ ...tdR, color: rateColor(open), fontWeight: 700 }}>
                      {open.toFixed(1)}%
                    </td>
                    <td style={{ ...tdR, color: C.purple, fontWeight: 600 }}>
                      {pctNum(g.uniqueClicks, g.delivered).toFixed(1)}%
                    </td>
                    <td style={tdR}>{pctNum(g.uniqueClicks, g.uniqueOpens).toFixed(1)}%</td>
                    <td style={tdR}>{fmt(g.unsubscribes)}</td>
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

function TemplatesTab({ current, tplMap }) {
  const [mode, setMode] = useState('theme')
  const groups = useMemo(() => {
    const keyFn = (r) => {
      const name =
        (tplMap[r.templateKey] && tplMap[r.templateKey].name) ||
        r.templateName ||
        r.templateKey ||
        ''
      if (mode === 'template') return r.templateName || r.templateKey || '\u2014'
      if (mode === 'family')
        return (tplMap[r.templateKey] && tplMap[r.templateKey].family) || familyOfName(name)
      return themeOf(name) // theme
    }
    const map = new Map()
    for (const r of current) {
      const k = keyFn(r)
      if (!map.has(k)) map.set(k, { label: k, rows: [] })
      map.get(k).rows.push(r)
    }
    const arr = [...map.values()].map((g) => ({ label: g.label, ...sumRows(g.rows) }))
    // grouped views sort by volume; template view by open rate
    if (mode === 'template')
      arr.sort((a, b) => pctNum(b.uniqueOpens, b.delivered) - pctNum(a.uniqueOpens, a.delivered))
    else arr.sort((a, b) => b.sent - a.sent)
    return arr
  }, [current, tplMap, mode])

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
  return (
    <Card title={titles[mode]} sub={subs[mode]}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['theme', 'By theme'],
          ['family', 'By family'],
          ['template', 'By template'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setMode(v)}
            style={{
              padding: '5px 12px',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${mode === v ? C.blue : C.border}`,
              background: mode === v ? C.blue : C.white,
              color: mode === v ? C.white : C.mid,
            }}
          >
            {l}
          </button>
        ))}
        <span style={{ fontSize: 11, color: C.mid, alignSelf: 'center', marginLeft: 'auto' }}>
          {groups.length} rows
        </span>
      </div>
      <LeaderTable groups={groups} />
    </Card>
  )
}

function Channels({ current }) {
  const byChannel = groupBy(current, 'channel', 'channel')
  const bySource = groupBy(current, 'source', 'source')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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

function Deliverability({ current, agg, complaintRate, bounceRate, weekly }) {
  const healthAlert = complaintRate > 0.1 || bounceRate > 5
  const trend = buildDeliverabilityTrend(current, weekly)
  return (
    <>
      {healthAlert && (
        <div
          style={{
            background: '#fef2f2',
            border: `1px solid ${C.red}`,
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
            color: '#991b1b',
          }}
        >
          ⚠️ <strong>Deliverability alert:</strong>{' '}
          {complaintRate > 0.1 && (
            <>Complaint rate {complaintRate.toFixed(3)}% above the 0.1% Gmail/Yahoo threshold. </>
          )}
          {bounceRate > 5 && <>Bounce rate {bounceRate.toFixed(1)}% elevated. </>}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Kpi ico="↩️" label="Hard bounces" val={fmt(agg.hardBounces)} clr={C.red} />
        <Kpi ico="🌀" label="Soft bounces" val={fmt(agg.softBounces)} clr={C.amber} />
        <Kpi
          ico="🚩"
          label="Complaints"
          val={fmt(agg.complaints)}
          clr={complaintRate > 0.1 ? C.red : C.mid}
          sub={complaintRate.toFixed(3) + '%'}
        />
        <Kpi ico="🚫" label="Unsubscribes" val={fmt(agg.unsubscribes)} clr={C.amber} />
      </div>
      <Card
        title="Complaints & bounces over time"
        sub="Watch for upward trends — they hurt sender reputation"
      >
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={trend} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: C.mid }} />
            <YAxis tick={{ fontSize: 11, fill: C.mid }} />
            <Tooltip />
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
      <Card title="By region" sub="Volume & engagement · watch complaint columns">
        <LeaderTable groups={groupBy(current, 'region', 'region')} nameKey />
      </Card>
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

const Screen = ({ children }) => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.bg }}>
    {children}
  </div>
)
const Spinner = () => (
  <div
    style={{
      width: 32,
      height: 32,
      border: `3px solid ${C.border}`,
      borderTopColor: C.green,
      borderRadius: '50%',
      animation: 'sp .8s linear infinite',
    }}
  >
    <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
  </div>
)
const Banner = ({ children }) => (
  <div
    style={{
      background: '#fef3c7',
      border: '1px solid #f59e0b',
      borderRadius: 8,
      padding: '10px 14px',
      fontSize: 12,
      color: '#92400e',
      marginBottom: 14,
    }}
  >
    ⚠️ {children}
  </div>
)
const Empty = ({ children }) => (
  <div style={{ textAlign: 'center', padding: 28, color: C.mid, fontSize: 13 }}>{children}</div>
)
const hdrBtn = {
  background: 'rgba(255,255,255,.1)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}
const thR = {
  fontSize: 11,
  fontWeight: 700,
  padding: '8px 10px',
  textAlign: 'right',
  color: C.mid,
  borderBottom: `2px solid ${C.border}`,
  whiteSpace: 'nowrap',
}
const tdR = {
  fontSize: 12,
  padding: '8px 10px',
  textAlign: 'right',
  color: C.dark,
  borderBottom: `1px solid ${C.bg}`,
  whiteSpace: 'nowrap',
}

function DeltaBadge({ delta, goodUp }) {
  if (!delta) return null
  if (delta.up === null)
    return <span style={{ fontSize: 10, color: C.mid, marginLeft: 6 }}>{delta.txt}</span>
  const isGood = goodUp ? delta.up : !delta.up
  const clr = isGood ? C.greenTxt : C.red
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: clr, marginLeft: 6 }}>
      {delta.up ? '▲' : '▼'} {delta.txt}
    </span>
  )
}
function Filter({ label, value, set, opts }) {
  return (
    <select
      value={value}
      onChange={(e) => set(e.target.value)}
      title={label}
      style={{
        padding: '7px 11px',
        borderRadius: 7,
        border: `1px solid ${C.border}`,
        background: C.white,
        color: C.dark,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  )
}
function Kpi({ ico, label, val, clr, sub, delta, goodUp }) {
  return (
    <div
      style={{
        background: C.white,
        borderRadius: 12,
        padding: '14px 16px',
        border: `1px solid ${C.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ fontSize: 17, marginBottom: 5 }}>{ico}</div>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: clr }}>{val}</span>
        <DeltaBadge delta={delta} goodUp={goodUp} />
      </div>
      <div style={{ fontSize: 11, color: C.mid, marginTop: 2, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.mid, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}
function Card({ title, sub, children }) {
  return (
    <div
      style={{
        background: C.white,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        padding: 18,
        marginBottom: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,.04)',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{title}</div>
      {sub && (
        <div style={{ fontSize: 12, color: C.mid, marginTop: 2, marginBottom: 12 }}>{sub}</div>
      )}
      {children}
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
        <Tooltip />
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
    <div className="no-print" style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!rows.length}
        style={{
          padding: '7px 11px',
          borderRadius: 7,
          border: `1px solid ${C.border}`,
          background: C.white,
          color: rows.length ? C.blue : C.mid,
          fontSize: 12,
          fontWeight: 600,
          cursor: rows.length ? 'pointer' : 'not-allowed',
        }}
      >
        ⬇ Export ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              zIndex: 11,
              background: C.white,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(0,0,0,.12)',
              minWidth: 190,
              overflow: 'hidden',
            }}
          >
            {items.map(([label, fn], i) => (
              <button
                key={label}
                onClick={run(fn)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 13px',
                  background: 'none',
                  border: 'none',
                  borderTop: i === items.length - 1 ? `1px solid ${C.border}` : 'none',
                  fontSize: 12,
                  color: C.dark,
                  cursor: 'pointer',
                }}
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

// Bucket raw events into a 7 (Mon–Sun) x 24 (local hour) grid.
function buildHourGrid(events, metric) {
  const want = metric === 'clicks' ? 'clicked' : metric === 'opens' ? 'opened' : 'delivered'
  const grid = DOW.map(() => new Array(24).fill(0))
  let total = 0
  for (const e of events) {
    if (e.eventType !== want) continue
    const d = new Date(e.timestamp)
    if (Number.isNaN(d.getTime())) continue
    grid[(d.getDay() + 6) % 7][d.getHours()] += 1
    total += 1
  }
  return { grid, total }
}

// Fallback when no raw events exist yet: day-of-week only, from the daily rollup.
function buildDowFromRows(rows, metric) {
  const key =
    metric === 'clicks' ? 'uniqueClicks' : metric === 'opens' ? 'uniqueOpens' : 'delivered'
  const out = DOW.map(() => 0)
  let total = 0
  for (const r of rows) {
    const d = new Date(r.date)
    if (Number.isNaN(d.getTime())) continue
    out[(d.getDay() + 6) % 7] += r[key] || 0
    total += r[key] || 0
  }
  return { out, total }
}

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

function MetricPicker({ metric, setMetric }) {
  return (
    <div className="no-print" style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {[
        ['opens', 'Opens'],
        ['clicks', 'Clicks'],
        ['delivered', 'Delivered'],
      ].map(([v, l]) => (
        <button
          key={v}
          onClick={() => setMetric(v)}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: `1px solid ${metric === v ? C.blue : C.border}`,
            background: metric === v ? C.blueLight : C.white,
            color: metric === v ? C.blue : C.mid,
            fontSize: 12,
            fontWeight: metric === v ? 700 : 500,
            cursor: 'pointer',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

function TimingTab({ events, current }) {
  const [metric, setMetric] = useState('opens')

  if (events === null)
    return (
      <Card title="Send-time performance" sub="Loading raw events…">
        <Spinner />
      </Card>
    )

  const label = metric === 'clicks' ? 'Clicks' : metric === 'opens' ? 'Opens' : 'Delivered'

  if (!events.length) {
    // No raw events yet (mock rollups only) — show what the daily rollup can answer.
    const { out, total } = buildDowFromRows(current, metric)
    const max = Math.max(...out)
    const best = out.indexOf(max)
    return (
      <Card
        title="Send-time performance"
        sub="Hour-of-day needs raw events — showing day-of-week from the daily rollup"
      >
        <MetricPicker metric={metric} setMetric={setMetric} />
        <Banner>
          No raw events in this range yet, so hourly resolution is not available. Once the Mailgun
          and OneSignal webhooks are live in production the full 7 x 24 heatmap fills in here.
        </Banner>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {DOW.map((d, i) => (
            <div key={d} style={{ flex: 1, textAlign: 'center' }}>
              <div
                title={`${d}: ${fmt(out[i])} ${label.toLowerCase()}`}
                style={{
                  height: 72,
                  borderRadius: 8,
                  background: heatColor(out[i], max),
                  border: `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  color: out[i] > max * 0.55 ? '#fff' : C.dark,
                }}
              >
                {fmt(out[i])}
              </div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 4, fontWeight: 600 }}>{d}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.mid, marginTop: 12 }}>
          {total > 0 ? (
            <>
              Best day for <strong>{label.toLowerCase()}</strong>: <strong>{DOW[best]}</strong> ·{' '}
              {fmt(max)} of {fmt(total)} ({pctStr(max, total)}).
            </>
          ) : (
            'No data in the selected range.'
          )}
        </div>
      </Card>
    )
  }

  const { grid, total } = buildHourGrid(events, metric)
  const max = Math.max(...grid.flat())
  let bestCell = { d: 0, h: 0, v: 0 }
  grid.forEach((row, d) =>
    row.forEach((v, h) => {
      if (v > bestCell.v) bestCell = { d, h, v }
    }),
  )
  const hourTotals = new Array(24).fill(0)
  grid.forEach((row) => row.forEach((v, h) => (hourTotals[h] += v)))
  const bestHour = hourTotals.indexOf(Math.max(...hourTotals))

  return (
    <Card
      title="Send-time performance"
      sub={`${label} by day of week x hour of day · ${fmt(total)} events · viewer local time`}
    >
      <MetricPicker metric={metric} setMetric={setMetric} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={{ ...thR, textAlign: 'left', padding: '4px 8px' }} />
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} style={{ ...thR, padding: '4px 2px', textAlign: 'center' }}>
                  {h % 2 === 0 ? String(h).padStart(2, '0') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, d) => (
              <tr key={DOW[d]}>
                <td
                  style={{
                    ...tdR,
                    textAlign: 'left',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderBottom: 'none',
                  }}
                >
                  {DOW[d]}
                </td>
                {row.map((v, h) => (
                  <td key={h} style={{ padding: 1, borderBottom: 'none' }}>
                    <div
                      title={`${DOW[d]} ${hh(h)} — ${fmt(v)} ${label.toLowerCase()}`}
                      style={{
                        width: 26,
                        height: 24,
                        borderRadius: 4,
                        background: heatColor(v, max),
                        border: `1px solid ${v ? 'transparent' : C.border}`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          fontSize: 11,
          color: C.mid,
          flexWrap: 'wrap',
        }}
      >
        <span>0</span>
        {[0.05, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
          <div
            key={t}
            style={{
              width: 26,
              height: 12,
              borderRadius: 3,
              background: heatColor(t * max, max),
              border: `1px solid ${C.border}`,
            }}
          />
        ))}
        <span>{fmt(max)}</span>
        <span style={{ marginLeft: 16 }}>
          Peak:{' '}
          <strong>
            {DOW[bestCell.d]} {hh(bestCell.h)}
          </strong>{' '}
          ({fmt(bestCell.v)}) · busiest hour overall <strong>{hh(bestHour)}</strong>
        </span>
      </div>
    </Card>
  )
}
