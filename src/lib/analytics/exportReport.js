// Client-side report export helpers for the Analytics dashboard.
// CSV is built in-browser from the already-filtered rollup rows (no extra API calls);
// PDF goes through the browser print dialog so we don't ship a PDF library.

const pct = (a, b) => (b > 0 ? ((a / b) * 100).toFixed(2) : '')

// RFC4180 escaping: quote anything containing a comma, quote, or newline.
function cell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function toCsv(headers, rows) {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')
}

export function download(filename, text, mime = 'text/csv;charset=utf-8') {
  // \uFEFF BOM so Excel reads UTF-8 template names correctly.
  const blob = new Blob(['\uFEFF' + text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function stamp(meta) {
  const bits = [
    'analytics',
    meta.tab ? meta.tab.toLowerCase() : null,
    meta.days ? `${meta.days}d` : null,
    meta.channel && meta.channel !== 'All' ? meta.channel : null,
    meta.region && meta.region !== 'All' ? meta.region.replace(/\s+/g, '-') : null,
    meta.campaign && meta.campaign !== 'All' ? meta.campaign.replace(/\s+/g, '-') : null,
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean)
  return bits.join('-') + '.csv'
}

const COUNTS = [
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

// One line per raw rollup row — the rawest export, good for pivoting in Excel.
export function exportDailyRows(rows, meta) {
  const headers = [
    'Date',
    'Channel',
    'Source',
    'Template key',
    'Template name',
    'Region',
    'Sent',
    'Delivered',
    'Delivered %',
    'Unique opens',
    'Open %',
    'Total opens',
    'Unique clicks',
    'CTR %',
    'CTOR %',
    'Total clicks',
    'Hard bounces',
    'Soft bounces',
    'Complaints',
    'Unsubscribes',
    'Failed',
  ]
  const body = [...rows]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((r) => [
      new Date(r.date).toISOString().slice(0, 10),
      r.channel,
      r.source,
      r.templateKey,
      r.templateName,
      r.region,
      r.sent || 0,
      r.delivered || 0,
      pct(r.delivered, r.sent),
      r.uniqueOpens || 0,
      pct(r.uniqueOpens, r.delivered),
      r.totalOpens || 0,
      r.uniqueClicks || 0,
      pct(r.uniqueClicks, r.delivered),
      pct(r.uniqueClicks, r.uniqueOpens),
      r.totalClicks || 0,
      r.hardBounces || 0,
      r.softBounces || 0,
      r.complaints || 0,
      r.unsubscribes || 0,
      r.failed || 0,
    ])
  download(stamp({ ...meta, tab: 'daily-rows' }), toCsv(headers, body))
}

// One line per group (template / family / theme / campaign / region / channel).
export function exportGroups(groups, labelHeader, meta) {
  const headers = [
    labelHeader,
    'Sent',
    'Delivered',
    'Delivered %',
    'Unique opens',
    'Open %',
    'Unique clicks',
    'CTR %',
    'CTOR %',
    'Hard bounces',
    'Soft bounces',
    'Complaints',
    'Unsubscribes',
    'Failed',
  ]
  const body = groups.map((g) => [
    g.label,
    g.sent || 0,
    g.delivered || 0,
    pct(g.delivered, g.sent),
    g.uniqueOpens || 0,
    pct(g.uniqueOpens, g.delivered),
    g.uniqueClicks || 0,
    pct(g.uniqueClicks, g.delivered),
    pct(g.uniqueClicks, g.uniqueOpens),
    g.hardBounces || 0,
    g.softBounces || 0,
    g.complaints || 0,
    g.unsubscribes || 0,
    g.failed || 0,
  ])
  download(stamp(meta), toCsv(headers, body))
}

// Headline totals + rates, with the previous-period comparison the dashboard shows.
export function exportSummary(agg, aggPrev, meta) {
  const headers = ['Metric', 'Current period', 'Previous period', 'Change %']
  const rate = (o, k1, k2) => (o[k2] > 0 ? (o[k1] / o[k2]) * 100 : 0)
  const change = (a, b) => (b > 0 ? (((a - b) / b) * 100).toFixed(1) : '')
  const body = [
    ...COUNTS.map((k) => [
      k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      agg[k] || 0,
      aggPrev[k] || 0,
      change(agg[k] || 0, aggPrev[k] || 0),
    ]),
    [
      'Delivery rate %',
      rate(agg, 'delivered', 'sent').toFixed(2),
      rate(aggPrev, 'delivered', 'sent').toFixed(2),
      '',
    ],
    [
      'Open rate %',
      rate(agg, 'uniqueOpens', 'delivered').toFixed(2),
      rate(aggPrev, 'uniqueOpens', 'delivered').toFixed(2),
      '',
    ],
    [
      'Click rate %',
      rate(agg, 'uniqueClicks', 'delivered').toFixed(2),
      rate(aggPrev, 'uniqueClicks', 'delivered').toFixed(2),
      '',
    ],
    [
      'Click-to-open %',
      rate(agg, 'uniqueClicks', 'uniqueOpens').toFixed(2),
      rate(aggPrev, 'uniqueClicks', 'uniqueOpens').toFixed(2),
      '',
    ],
  ]
  const preamble = toCsv(
    ['Report', 'Value'],
    [
      ['Generated', new Date().toISOString()],
      ['Range', `Last ${meta.days} days`],
      ['Channel', meta.channel],
      ['Region', meta.region],
      ['Campaign', meta.campaign],
    ],
  )
  download(stamp({ ...meta, tab: 'summary' }), preamble + '\r\n\r\n' + toCsv(headers, body))
}
