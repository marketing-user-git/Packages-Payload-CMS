import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { ingestEvent, APPS, resolveTemplate } from '@/lib/analytics/webhookUtils'

const first = (...values: any[]) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')

const eventMap: Record<string, string> = {
  // Current OneSignal Event Streams email events
  'message.email.sent': 'accepted',
  'message.email.received': 'delivered',
  'message.email.opened': 'opened',
  'message.email.clicked': 'clicked',
  'message.email.unsubscribed': 'unsubscribed',
  'message.email.reported_as_spam': 'complained',
  'message.email.bounced': 'bounced_hard',
  'message.email.hardbounced': 'bounced_hard',
  'message.email.failed': 'failed',
  'message.email.suppressed': 'failed',
  'message.email.supressed': 'failed',

  // Push Event Streams / legacy webhook compatibility
  'message.push.sent': 'accepted',
  'message.push.received': 'delivered',
  'message.push.clicked': 'clicked',
  'message.push.failed': 'failed',
  sent: 'accepted',
  'notification.sent': 'accepted',
  delivered: 'delivered',
  displayed: 'delivered',
  'notification.delivered': 'delivered',
  clicked: 'clicked',
  'notification.clicked': 'clicked',
  failed: 'failed',
  'notification.failed': 'failed',
}

const toTimestamp = (datetime: unknown, unix: unknown) => {
  if (datetime) {
    const parsed = new Date(String(datetime))
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  const numeric = Number(unix)
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000).toISOString()
  }

  return new Date().toISOString()
}

/**
 * OneSignal Event Streams receiver for RegFunnelOps delivery + engagement.
 *
 * Accepts both the documented flattened custom-body keys ("event.kind",
 * "message.id", etc.) and nested JSON so the stream can evolve without
 * breaking ingestion.
 *
 * Authentication: prefer `Authorization: Bearer <WEBHOOK_SHARED_SECRET>`.
 * `?token=` and `X-API-Key` remain supported for backwards compatibility.
 */
export const POST = async (req: Request) => {
  const url = new URL(req.url)
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const providedSecret = first(url.searchParams.get('token'), bearer, req.headers.get('x-api-key'))

  if (!process.env.WEBHOOK_SHARED_SECRET || providedSecret !== process.env.WEBHOOK_SHARED_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const eventKind: string | undefined = first(
    body?.['event.kind'],
    body?.event?.kind,
    body?.event,
    body?.kind,
    body?.type,
  )
  const eventType = eventKind ? eventMap[eventKind] : undefined

  if (!eventType) {
    return Response.json({ ok: true, ignored: true, unmappedEvent: eventKind }, { status: 200 })
  }

  const appId: string | undefined = first(
    body?.['event.app_id'],
    body?.event?.app_id,
    body?.['user.subscription.app_id'],
    body?.user?.subscription?.app_id,
    body?.app_id,
    body?.appId,
  )
  const notificationId: string | undefined = first(
    body?.['message.id'],
    body?.message?.id,
    body?.notification_id,
    body?.notificationId,
  )
  const eventId: string | undefined = first(body?.['event.id'], body?.event?.id)
  const subscriptionId: string | undefined = first(
    body?.['event.subscription_id'],
    body?.event?.subscription_id,
    body?.['user.subscription.id'],
    body?.user?.subscription?.id,
    body?.subscription_id,
  )
  const externalId: string | undefined = first(
    body?.['event.external_id'],
    body?.event?.external_id,
    body?.external_id,
  )
  const recipient: string | undefined = first(
    body?.['user.subscription.subscription_token'],
    body?.user?.subscription?.subscription_token,
    body?.recipient,
    body?.email,
    body?.player_id,
  )
  const streamTemplateId: string | undefined = first(
    body?.['message.template_id'],
    body?.message?.template_id,
  )
  const streamTemplateName: string | undefined = first(
    body?.['message.template_name'],
    body?.message?.template_name,
  )
  const failureReason: string | undefined = first(
    body?.['event.data.failure_reason'],
    body?.event?.data?.failure_reason,
  )
  const timestamp = toTimestamp(
    first(body?.['event.datetime'], body?.event?.datetime),
    first(body?.['event.timestamp'], body?.event?.timestamp, body?.timestamp),
  )

  const appCfg = appId ? APPS[appId] : undefined
  const source = appCfg?.source || 'onesignal_global'
  const channel = eventKind?.startsWith('message.email.') ? 'email' : 'push'
  const payload = await getPayload({ config: configPromise })

  try {
    let region: string | undefined = first(body?.region, body?.['region'])
    if (!region && externalId) {
      const enrollment = await payload.find({
        collection: 'funnel-enrollment',
        where: { externalId: { equals: externalId } },
        limit: 1,
        overrideAccess: true,
      })
      region = enrollment.docs[0]?.funnelRegion || undefined
    }

    const resolved = await resolveTemplate(payload, notificationId, appId)
    let templateKey = resolved.templateKey
    let templateName = streamTemplateName || resolved.templateName
    const templateId = streamTemplateId || resolved.templateId

    if (!templateKey && templateId && appCfg) {
      const mapping = await payload.find({
        collection: 'template-mappings',
        where: { [appCfg.tplField]: { equals: templateId } },
        limit: 1,
        overrideAccess: true,
      })
      if (mapping.docs.length) {
        templateKey = mapping.docs[0].templateKey || null
        templateName = templateName || mapping.docs[0].templateName || null
      }
    }

    const recipientKey = subscriptionId || recipient || externalId || eventId || ''
    const messageId = notificationId
      ? `${notificationId}:${recipientKey}`
      : eventId || undefined

    const res = await ingestEvent(payload, {
      channel,
      source,
      eventType,
      recipient,
      messageId,
      notificationId,
      templateKey,
      templateName,
      templateId,
      region,
      timestamp,
      metadata: {
        eventKind,
        eventId,
        externalId,
        subscriptionId,
        failureReason,
      },
    })

    return Response.json({ ok: true, eventKind, channel, ...res }, { status: 200 })
  } catch (error: any) {
    console.error('onesignal ingest error:', error?.message || error)
    return Response.json({ error: 'ingest failed' }, { status: 500 })
  }
}

export const GET = async () =>
  Response.json({ ok: true, route: 'onesignal event streams webhook' })
