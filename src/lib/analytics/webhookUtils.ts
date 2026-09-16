import crypto from 'crypto'

// ── App configuration (from env) ──────────────────────────────────────────────
export const APPS: Record<string, { source: string; restKey?: string; tplField: 'globalTemplateId' | 'chinaTemplateId' }> = {
  [process.env.ONESIGNAL_GLOBAL_APP_ID || '']: {
    source: 'onesignal_global',
    restKey: process.env.ONESIGNAL_GLOBAL_REST_KEY,
    tplField: 'globalTemplateId',
  },
  [process.env.ONESIGNAL_CHINA_APP_ID || '']: {
    source: 'onesignal_china',
    restKey: process.env.ONESIGNAL_CHINA_REST_KEY,
    tplField: 'chinaTemplateId',
  },
}

// ── Mailgun HMAC verification ─────────────────────────────────────────────────
export function verifyMailgun(sig: { timestamp: string; token: string; signature: string }): boolean {
  const key = process.env.MAILGUN_SIGNING_KEY
  if (!key || !sig?.timestamp || !sig?.token || !sig?.signature) return false
  const digest = crypto.createHmac('sha256', key).update(sig.timestamp + sig.token).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(sig.signature))
  } catch {
    return false
  }
}

// ── Mailgun event → our eventType ─────────────────────────────────────────────
export function mapMailgunEvent(ed: any): string | null {
  const e = ed?.event
  switch (e) {
    // SendLog is the RegFunnel source of truth for sends. We deliberately do
    // not ingest Mailgun "accepted" as another sent signal.
    case 'accepted': return null
    case 'delivered': return 'delivered'
    case 'opened': return 'opened'
    case 'clicked': return 'clicked'
    case 'unsubscribed': return 'unsubscribed'
    case 'complained': return 'complained'
    case 'failed':
      return ed?.severity === 'permanent' ? 'bounced_hard' : 'bounced_soft'
    default: return null
  }
}

// ── Template resolution (OneSignal View Message API + cache) ───────────────────
export async function resolveTemplate(
  payload: any,
  notificationId: string | undefined,
  appId: string | undefined,
): Promise<{ templateKey: string | null; templateName: string | null; templateId: string | null }> {
  const empty = { templateKey: null, templateName: null, templateId: null }
  if (!notificationId) return empty

  const cached = await payload.find({
    collection: 'notifications-cache',
    where: { notificationId: { equals: notificationId } },
    limit: 1,
  })
  if (cached.docs.length) {
    const c = cached.docs[0]
    return { templateKey: c.templateKey || null, templateName: null, templateId: c.templateId || null }
  }

  const appCfg = appId ? APPS[appId] : undefined
  let templateId: string | null = null
  let templateName: string | null = null
  if (appCfg?.restKey && appId) {
    try {
      const r = await fetch(`https://api.onesignal.com/notifications/${notificationId}?app_id=${appId}`, {
        headers: { Authorization: `Key ${appCfg.restKey}` },
      })
      if (r.ok) {
        const data = await r.json()
        templateId = data?.template_id || null
        templateName = data?.name || null
      }
    } catch {
      // Network issues must not prevent raw delivery events being stored.
    }
  }

  let templateKey: string | null = null
  if (templateId && appCfg) {
    const m = await payload.find({
      collection: 'template-mappings',
      where: { [appCfg.tplField]: { equals: templateId } },
      limit: 1,
    })
    if (m.docs.length) {
      templateKey = m.docs[0].templateKey
      templateName = m.docs[0].templateName
    }
  }

  try {
    await payload.create({
      collection: 'notifications-cache',
      overrideAccess: true,
      data: {
        notificationId,
        source: appCfg?.source,
        appId,
        templateId,
        templateKey,
        firstSeen: new Date().toISOString(),
      } as any,
    })
  } catch {
    // Unique race: another request cached the same notification first.
  }

  return { templateKey, templateName, templateId }
}

// ── Event idempotency / uniqueness ────────────────────────────────────────────
async function providerEventRecorded(payload: any, providerEventId: string): Promise<boolean> {
  if (!providerEventId) return false
  const existing = await payload.find({
    collection: 'events',
    where: { providerEventId: { equals: providerEventId } },
    limit: 1,
    overrideAccess: true,
  })
  return existing.docs.length > 0
}

async function isFirst(payload: any, messageId: string, recipient: string, eventType: string): Promise<boolean> {
  if (!messageId || !recipient) return true
  const existing = await payload.find({
    collection: 'events',
    where: { and: [{ messageId: { equals: messageId } }, { recipient: { equals: recipient } }, { eventType: { equals: eventType } }] },
    limit: 1,
    overrideAccess: true,
  })
  return existing.docs.length === 0
}

async function alreadyRecorded(payload: any, messageId: string, eventType: string): Promise<boolean> {
  if (!messageId) return false
  const existing = await payload.find({
    collection: 'events',
    where: { and: [{ messageId: { equals: messageId } }, { eventType: { equals: eventType } }] },
    limit: 1,
    overrideAccess: true,
  })
  return existing.docs.length > 0
}

// ── Rollup upsert into analytics-daily ────────────────────────────────────────
const COUNTER: Record<string, string[]> = {
  accepted: ['sent'],
  delivered: ['delivered'],
  opened: ['totalOpens'],
  clicked: ['totalClicks'],
  bounced_hard: ['hardBounces'],
  bounced_soft: ['softBounces'],
  complained: ['complaints'],
  unsubscribed: ['unsubscribes'],
  failed: ['failed'],
}

async function applyToRollup(payload: any, ev: any) {
  const day = new Date(ev.timestamp)
  day.setHours(0, 0, 0, 0)
  const nextDay = new Date(day.getTime() + 86400000)
  const templateKey = ev.templateKey || 'unmapped'
  const region = ev.region || 'Unknown'

  const found = await payload.find({
    collection: 'analytics-daily',
    where: {
      and: [
        { date: { greater_than_equal: day.toISOString() } },
        { date: { less_than: nextDay.toISOString() } },
        { channel: { equals: ev.channel } },
        { source: { equals: ev.source } },
        { templateKey: { equals: templateKey } },
        { region: { equals: region } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const inc = COUNTER[ev.eventType] || []
  const bump: Record<string, number> = {}
  for (const f of inc) bump[f] = 1
  if (ev.eventType === 'opened' && ev.isUnique) bump.uniqueOpens = 1
  if (ev.eventType === 'clicked' && ev.isUnique) bump.uniqueClicks = 1

  if (found.docs.length) {
    const row = found.docs[0]
    const data: Record<string, number> = {}
    for (const [k, v] of Object.entries(bump)) data[k] = (row[k] || 0) + v
    await payload.update({ collection: 'analytics-daily', id: row.id, data, overrideAccess: true })
  } else {
    await payload.create({
      collection: 'analytics-daily',
      overrideAccess: true,
      data: {
        date: day.toISOString(), channel: ev.channel, source: ev.source,
        templateKey, templateName: ev.templateName || templateKey, region,
        ...bump,
      } as any,
    })
  }
}

// ── Main: ingest one normalized event (write raw + rollup) ─────────────────────
export async function ingestEvent(payload: any, ev: {
  channel: string; source: string; eventType: string;
  providerEventId?: string; recipient?: string; messageId?: string; notificationId?: string;
  templateKey?: string | null; templateName?: string | null; templateId?: string | null;
  region?: string; timestamp: string; metadata?: any;
}) {
  if (ev.providerEventId && (await providerEventRecorded(payload, ev.providerEventId))) {
    return { skipped: 'duplicate_provider_event' }
  }

  const multiEvent = ev.eventType === 'opened' || ev.eventType === 'clicked'

  if (!multiEvent && ev.messageId && (await alreadyRecorded(payload, ev.messageId, ev.eventType))) {
    return { skipped: 'duplicate_message_event' }
  }

  const isUnique = multiEvent
    ? await isFirst(payload, ev.messageId || '', ev.recipient || '', ev.eventType)
    : false

  try {
    await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        channel: ev.channel,
        source: ev.source,
        eventType: ev.eventType,
        providerEventId: ev.providerEventId || undefined,
        recipient: ev.recipient,
        messageId: ev.messageId,
        notificationId: ev.notificationId,
        templateKey: ev.templateKey || undefined,
        templateId: ev.templateId || undefined,
        region: ev.region,
        timestamp: ev.timestamp,
        isUnique,
        metadata: ev.metadata,
      } as any,
    })
  } catch (error) {
    // The DB unique index is the concurrency backstop for simultaneous webhook
    // retries that race past the pre-check.
    if (ev.providerEventId && (await providerEventRecorded(payload, ev.providerEventId))) {
      return { skipped: 'duplicate_provider_event' }
    }
    throw error
  }

  await applyToRollup(payload, { ...ev, isUnique })
  return { ok: true, isUnique }
}
