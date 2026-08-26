/**
 * Send a correctly-signed fake Mailgun webhook to the local route,
 * so you can test the full flow (verify → enrich → ingest → rollup)
 * WITHOUT a tunnel or a real email.
 *
 * Run:  node --import tsx scripts/test-mailgun-webhook.ts [event]
 * e.g.  node --import tsx scripts/test-mailgun-webhook.ts opened
 *       node --import tsx scripts/test-mailgun-webhook.ts delivered
 *
 * Sends a small burst (accepted → delivered → opened → clicked) by default.
 */
import 'dotenv/config'
import crypto from 'crypto'

const URL_ = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/mailgun'
const KEY = process.env.MAILGUN_SIGNING_KEY
const GLOBAL_APP = process.env.ONESIGNAL_GLOBAL_APP_ID || '532fff1a-2b71-476a-822b-4b5806719330'

if (!KEY) {
  console.error('✖ MAILGUN_SIGNING_KEY is missing from .env — cannot sign the test payload.')
  process.exit(1)
}

function sign() {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const token = crypto.randomBytes(16).toString('hex')
  const signature = crypto
    .createHmac('sha256', KEY!)
    .update(timestamp + token)
    .digest('hex')
  return { timestamp, token, signature }
}

function makeEvent(event: string, messageId: string, notificationId: string, recipient: string) {
  const base: any = {
    event,
    recipient,
    timestamp: Date.now() / 1000,
    message: { headers: { 'message-id': messageId } },
    'user-variables': {
      app_id: GLOBAL_APP,
      notification_id: notificationId,
      player_id: crypto.randomUUID(),
      region: 'MENA', // demo region (pass this as a custom var in real sends)
    },
    geolocation: { city: 'Limassol', country: 'CY' },
    'client-info': { 'client-name': 'Edge', 'device-type': 'desktop' },
  }
  if (event === 'failed') base.severity = 'permanent'
  return base
}

async function post(
  event: string,
  ids: { messageId: string; notificationId: string; recipient: string },
) {
  const body = {
    signature: sign(),
    'event-data': makeEvent(event, ids.messageId, ids.notificationId, ids.recipient),
  }
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const txt = await r.text()
  console.log(`  ${event.padEnd(10)} → ${r.status} ${txt}`)
}

const run = async () => {
  const only = process.argv[2]
  const messageId = `test-${Date.now()}@ms.easy-markets.com`
  const notificationId = crypto.randomUUID()
  const recipient = `tester+${Math.floor(Math.random() * 9999)}@easy-markets.com`

  console.log(`Posting to ${URL_}`)
  console.log(`message-id: ${messageId}`)
  console.log(
    `notification_id: ${notificationId} (no real OneSignal template → will land as "unmapped")\n`,
  )

  const seq = only ? [only] : ['accepted', 'delivered', 'opened', 'clicked']
  for (const e of seq) {
    // eslint-disable-next-line no-await-in-loop
    await post(e, { messageId, notificationId, recipient })
  }
  console.log(
    '\n✅ Done. Refresh the dashboard — check the "Unknown" region / "unmapped" template rows.',
  )
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
