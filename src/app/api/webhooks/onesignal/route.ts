import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { ingestEvent, APPS } from '@/lib/analytics/webhookUtils'

/**
 * OneSignal push webhook (Event Streams / webhook).
 *
 * NOTE: we don't yet have a real OneSignal webhook payload sample, so this route
 * is defensive: it logs the raw body (so you can capture the real shape), then
 * makes a best-effort mapping. Once you send a real event and we see the payload,
 * we finalize the field mapping — exactly like we did with Mailgun.
 *
 * Security: OneSignal webhooks aren't HMAC-signed by default, so we require a
 * shared secret in the URL: /api/webhooks/onesignal?token=YOUR_SECRET
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

  // 🔍 Capture the real shape — check your server logs after the first real event.
  console.log('[onesignal webhook] raw payload:', JSON.stringify(body).slice(0, 2000))

  // Best-effort extraction (adjust once we see a real payload)
  const appId: string | undefined = body?.app_id || body?.appId
  const notificationId: string | undefined = body?.notification_id || body?.id
  const rawEvent: string | undefined = body?.event || body?.kind || body?.type

  // Map OneSignal push events → our eventType (tentative)
  const map: Record<string, string> = {
    sent: 'accepted',
    'notification.sent': 'accepted',
    delivered: 'delivered',
    'notification.delivered': 'delivered',
    displayed: 'delivered',
    clicked: 'clicked',
    'notification.clicked': 'clicked',
    failed: 'failed',
    'notification.failed': 'failed',
  }
  const eventType = rawEvent ? map[rawEvent] : undefined

  if (!eventType) {
    // Unknown/unmapped — acknowledge so OneSignal doesn't retry, but record nothing.
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
      // push template resolution can reuse resolveTemplate later if needed
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

export const GET = async () => Response.json({ ok: true, route: 'onesignal webhook' })