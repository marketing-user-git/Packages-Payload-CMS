import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { ingestEvent, APPS } from '@/lib/analytics/webhookUtils'

/**
 * OneSignal push webhook (Event Streams / webhook).
 *
 * Email delivery/engagement events are intentionally sourced from Mailgun via
 * /api/webhooks/mailgun because Mailgun is the actual email delivery provider.
 * Keeping the sources separate avoids duplicate email events if OneSignal email
 * Event Streams are enabled later.
 *
 * Security: OneSignal webhooks are protected with the shared secret in the URL:
 * /api/webhooks/onesignal?token=YOUR_SECRET
 */
export const POST = async (req: Request) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  if (!process.env.WEBHOOK_SHARED_SECRET || token !== process.env.WEBHOOK_SHARED_SECRET) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  const appId: string | undefined = body?.app_id || body?.appId
  const notificationId: string | undefined = body?.notification_id || body?.id
  const rawEvent: string | undefined = body?.event || body?.kind || body?.type

  const map: Record<string, string> = {
    sent: 'accepted',
    'notification.sent': 'accepted',
    'message.push.sent': 'accepted',
    delivered: 'delivered',
    displayed: 'delivered',
    'notification.delivered': 'delivered',
    'message.push.received': 'delivered',
    clicked: 'clicked',
    'notification.clicked': 'clicked',
    'message.push.clicked': 'clicked',
    failed: 'failed',
    'notification.failed': 'failed',
    'message.push.failed': 'failed',
  }
  const eventType = rawEvent ? map[rawEvent] : undefined

  if (!eventType) {
    return Response.json({ ok: true, captured: true, unmappedEvent: rawEvent }, { status: 200 })
  }

  const appCfg = appId ? APPS[appId] : undefined
  const source = appCfg?.source || 'onesignal_global'

  const payload = await getPayload({ config: configPromise })
  try {
    const res = await ingestEvent(payload, {
      channel: 'push',
      source,
      eventType,
      recipient: body?.player_id || body?.subscription_id,
      messageId: notificationId ? `${notificationId}:${body?.player_id || ''}` : undefined,
      notificationId,
      templateKey: null,
      region: body?.region,
      timestamp: new Date((body?.timestamp ? Number(body.timestamp) * 1000 : Date.now())).toISOString(),
      metadata: { raw: body },
    })
    return Response.json({ ok: true, ...res }, { status: 200 })
  } catch (e: any) {
    console.error('onesignal ingest error:', e?.message || e)
    return Response.json({ error: 'ingest failed' }, { status: 500 })
  }
}

export const GET = async () => Response.json({ ok: true, route: 'onesignal push webhook' })
