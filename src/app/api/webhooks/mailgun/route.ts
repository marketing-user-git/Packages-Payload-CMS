import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { verifyMailgun, mapMailgunEvent, resolveTemplate, ingestEvent, APPS } from '@/lib/analytics/webhookUtils'

const normalizeUserVariables = (value: any): Record<string, any> => {
  if (!value) return {}
  if (!Array.isArray(value) && typeof value === 'object') return value

  if (Array.isArray(value)) {
    return value.reduce((acc: Record<string, any>, item: any) => {
      if (!item) return acc
      if (typeof item === 'object') {
        const key = item.name ?? item.key
        if (key) acc[String(key)] = item.value
      }
      return acc
    }, {})
  }

  return {}
}

const verifySignature = (sig: any) => {
  if (!sig) return false
  if (verifyMailgun(sig)) return true

  // Account/subaccount webhooks can include a parent signature. This lets a
  // parent signing key validate child-domain events without weakening normal HMAC checks.
  if (sig['parent-signature']) {
    return verifyMailgun({
      timestamp: sig.timestamp,
      token: sig.token,
      signature: sig['parent-signature'],
    })
  }

  return false
}

export const POST = async (req: Request) => {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 })
  }

  // Mailgun normally sends { signature, "event-data" }. Keep a direct-event
  // fallback as well so the receiver is resilient to account/domain webhook
  // envelope differences while retaining signature verification.
  const sig = body?.signature
  const ed = body?.['event-data'] || body
  if (!sig || !ed?.event) {
    return Response.json({ error: 'unexpected payload shape' }, { status: 400 })
  }

  if (!verifySignature(sig)) {
    return Response.json({ error: 'signature verification failed' }, { status: 401 })
  }

  const eventType = mapMailgunEvent(ed)
  if (!eventType) {
    return Response.json({ ok: true, ignored: true, reason: 'untracked_event', event: ed?.event }, { status: 200 })
  }

  const uv = normalizeUserVariables(ed?.['user-variables'])
  const appId: string | undefined = uv.app_id || uv.appId
  const notificationId: string | undefined = uv.notification_id || uv.notificationId

  // ms.easy-markets.com carries much more traffic than RegFunnelOps. Do not
  // persist generic Mailgun traffic. A valid RegFunnel event must carry the
  // OneSignal notification_id that was recorded by our Sender in SendLog.
  if (!notificationId) {
    return Response.json({
      ok: true,
      ignored: true,
      reason: 'missing_notification_id',
      eventType,
    }, { status: 200 })
  }

  const payload = await getPayload({ config: configPromise })
  const sendLog = await payload.find({
    collection: 'send-log',
    where: {
      and: [
        { notificationId: { equals: notificationId } },
        { result: { equals: 'sent' } },
      ],
    },
    limit: 1,
    overrideAccess: true,
  })

  const matchedSend = sendLog.docs[0]
  if (!matchedSend) {
    return Response.json({
      ok: true,
      ignored: true,
      reason: 'unknown_notification_id',
      eventType,
    }, { status: 200 })
  }

  const messageId: string | undefined = ed?.message?.headers?.['message-id']
  const recipient: string | undefined = ed?.recipient
  const region: string | undefined = uv.region
  const tsSec = ed?.timestamp || sig?.timestamp
  const timestamp = new Date((Number(tsSec) || Date.now() / 1000) * 1000).toISOString()

  // The RegFunnel identity bridge is notification_id -> SendLog.notificationId.
  // Template resolution only happens after that bridge has been validated, so
  // unrelated Mailgun traffic can never trigger lookups or writes downstream.
  const tpl = await resolveTemplate(payload, notificationId, appId)

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
        mailgunEventId: ed?.id,
        severity: ed?.severity,
        reason: ed?.reason,
        geo: ed?.geolocation,
        client: ed?.['client-info'],
        sendLogId: matchedSend.id,
        externalId: matchedSend.externalId,
        stepId: matchedSend.stepId,
        osApp: matchedSend.osApp,
      },
    })

    return Response.json({
      ok: true,
      eventType,
      linkedToNotification: true,
      ...res,
    }, { status: 200 })
  } catch (e: any) {
    console.error('mailgun ingest error:', e?.message || e)
    return Response.json({ error: 'ingest failed' }, { status: 500 })
  }
}

// Useful both locally and in production for a zero-side-effect health check.
export const GET = async () => Response.json({
  ok: true,
  route: 'mailgun webhook',
  signingKeyConfigured: Boolean(process.env.MAILGUN_SIGNING_KEY),
})
