import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { verifyMailgun, mapMailgunEvent, resolveTemplate, ingestEvent, APPS } from '@/lib/analytics/webhookUtils'

export const POST = async (req: Request) => {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  // Mailgun format: { signature: {...}, "event-data": {...} }
  const sig = body?.signature
  const ed = body?.['event-data']
  if (!sig || !ed) return Response.json({ error: 'unexpected payload shape' }, { status: 400 })

  // 1) verify HMAC — reject forgeries
  if (!verifyMailgun(sig)) {
    return Response.json({ error: 'signature verification failed' }, { status: 401 })
  }

  // 2) map event type (ignore ones we don't track)
  const eventType = mapMailgunEvent(ed)
  if (!eventType) return Response.json({ ok: true, ignored: ed?.event }, { status: 200 })

  const payload = await getPayload({ config: configPromise })

  const uv = ed['user-variables'] || {}
  const appId: string | undefined = uv.app_id
  const notificationId: string | undefined = uv.notification_id
  const messageId: string | undefined = ed?.message?.headers?.['message-id']
  const recipient: string | undefined = ed?.recipient
  const region: string | undefined = uv.region // pass a `region` custom var from OneSignal to populate this
  const tsSec = ed?.timestamp || sig?.timestamp
  const timestamp = new Date((Number(tsSec) || Date.now() / 1000) * 1000).toISOString()

  // 3) resolve template (cache → OneSignal API once per notification)
  const tpl = await resolveTemplate(payload, notificationId, appId)

  // 4) ingest (raw event + rollup). Email source of truth = mailgun.
  try {
    const res = await ingestEvent(payload, {
      channel: 'email',
      source: 'mailgun',
      eventType,
      recipient,
      messageId,
      notificationId,
      templateKey: tpl.templateKey,
      templateName: tpl.templateName,
      templateId: tpl.templateId,
      region,
      timestamp,
      metadata: {
        appSource: appId && APPS[appId] ? APPS[appId].source : undefined,
        geo: ed?.geolocation, client: ed?.['client-info'],
      },
    })
    return Response.json({ ok: true, ...res }, { status: 200 })
  } catch (e: any) {
    console.error('mailgun ingest error:', e?.message || e)
    return Response.json({ error: 'ingest failed' }, { status: 500 })
  }
}

// Optional: allow GET for a quick health check
export const GET = async () => Response.json({ ok: true, route: 'mailgun webhook' })