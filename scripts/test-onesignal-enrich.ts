/**
 * Diagnose OneSignal template enrichment.
 *
 * Calls the View Message API for a real notification_id and prints what comes back,
 * trying both auth schemes ("Key" and "Basic") so we know which your app needs.
 *
 * Run:  node --import tsx scripts/test-onesignal-enrich.ts <notification_id> [global|china]
 * e.g.  node --import tsx scripts/test-onesignal-enrich.ts c9082d39-b98b-467b-9cfc-40deb3e95fb7 global
 *
 * Get a real notification_id from a recent Mailgun payload (user-variables.notification_id)
 * or from the OneSignal dashboard (Messages → open one → Message ID).
 */
import 'dotenv/config'

const APPS = {
  global: { id: process.env.ONESIGNAL_GLOBAL_APP_ID, key: process.env.ONESIGNAL_GLOBAL_REST_KEY },
  china: { id: process.env.ONESIGNAL_CHINA_APP_ID, key: process.env.ONESIGNAL_CHINA_REST_KEY },
}

async function tryScheme(scheme: 'Key' | 'Basic', notifId: string, appId: string, key: string) {
  const url = `https://api.onesignal.com/notifications/${notifId}?app_id=${appId}`
  try {
    const r = await fetch(url, { headers: { Authorization: `${scheme} ${key}` } })
    const text = await r.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { scheme, status: r.status, ok: r.ok, json, text: text.slice(0, 300) }
  } catch (e: any) {
    return { scheme, status: 0, ok: false, error: e?.message }
  }
}

const run = async () => {
  const notifId = process.argv[2]
  const appName = (process.argv[3] || 'global') as 'global' | 'china'
  if (!notifId) {
    console.error(
      'Usage: node --import tsx scripts/test-onesignal-enrich.ts <notification_id> [global|china]',
    )
    process.exit(1)
  }
  const app = APPS[appName]
  if (!app?.id || !app?.key) {
    console.error(
      `✖ Missing env for "${appName}" app. Need ONESIGNAL_${appName.toUpperCase()}_APP_ID and ONESIGNAL_${appName.toUpperCase()}_REST_KEY`,
    )
    process.exit(1)
  }

  console.log(`App: ${appName} (${app.id})`)
  console.log(`Notification: ${notifId}\n`)

  for (const scheme of ['Key', 'Basic'] as const) {
    const res = await tryScheme(scheme, notifId, app.id!, app.key!)
    if (res.ok) {
      console.log(`✅ Auth scheme "${scheme}" WORKS (status ${res.status})`)
      console.log(
        `   → template_id: ${res.json?.template_id ?? '(none — ad-hoc send, no template)'}`,
      )
      console.log(`   → name:        ${res.json?.name ?? '(none)'}`)
      console.log(`\n   Use  Authorization: "${scheme} <restKey>"  in webhookUtils.ts`)
      if (res.json?.template_id) {
        console.log(
          `\n   ⚠️  Add this real template_id to a TemplateMappings row (${appName === 'global' ? 'globalTemplateId' : 'chinaTemplateId'}):`,
        )
        console.log(`       ${res.json.template_id}`)
      }
      process.exit(0)
    } else {
      console.log(`✖ "${scheme}" → status ${res.status} ${res.error || res.text || ''}`)
    }
  }
  console.log(
    '\nNeither scheme worked. Check that the REST API key matches this app, and that the notification_id belongs to it.',
  )
  process.exit(1)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
