/**
 * Auto-sync OneSignal templates → TemplateMappings.
 *
 * Fetches every template from both apps (global + china) via the OneSignal API
 * and upserts them into template-mappings, uniting same-named templates across
 * apps under one canonical templateKey.
 *
 * Run:  node --import tsx scripts/sync-templates.ts
 *
 * Safe to re-run: matches by templateKey (slug of name) and updates in place.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

const APPS = [
  {
    name: 'global',
    field: 'globalTemplateId',
    id: process.env.ONESIGNAL_GLOBAL_APP_ID,
    key: process.env.ONESIGNAL_GLOBAL_REST_KEY,
  },
  {
    name: 'china',
    field: 'chinaTemplateId',
    id: process.env.ONESIGNAL_CHINA_APP_ID,
    key: process.env.ONESIGNAL_CHINA_REST_KEY,
  },
] as const

// name → canonical key. Strips trailing date-ish suffixes so weekly variants group together.
function slugify(name: string): string {
  return (
    name
      .replace(/\s*[-–]\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\s*$/, '') // trailing "- 14/08/2026"
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled'
  )
}

// Fix common mojibake (e.g. corrupted non-breaking spaces) and tidy whitespace.
function cleanName(name: string): string {
  return name
    .replace(/\u00e1|\u00a0/g, ' ') // "á" mojibake / nbsp → space
    .replace(/\s+/g, ' ')
    .trim()
}

// Family = first segment before the first " - " (or the whole name if none).
function familyOf(name: string): string {
  const clean = cleanName(name)
  const idx = clean.indexOf(' - ')
  return (idx > 0 ? clean.slice(0, idx) : clean).trim()
}

async function fetchTemplates(appId: string, key: string) {
  const out: Array<{ id: string; name: string }> = []
  let offset = 0
  const limit = 50
  while (true) {
    const r = await fetch(
      `https://api.onesignal.com/templates?app_id=${appId}&limit=${limit}&offset=${offset}`,
      {
        headers: { Authorization: `Key ${key}` },
      },
    )
    if (!r.ok) {
      console.error(`  ✖ fetch failed (status ${r.status}): ${(await r.text()).slice(0, 200)}`)
      break
    }
    const data = await r.json()
    const list = data?.templates || []
    for (const t of list) out.push({ id: t.id, name: cleanName(t.name || '(unnamed)') })
    if (list.length < limit) break
    offset += limit
  }
  return out
}

const run = async () => {
  const payload = await getPayload({ config })
  let created = 0,
    updated = 0

  for (const app of APPS) {
    if (!app.id || !app.key) {
      console.log(`Skipping ${app.name} — missing env.`)
      continue
    }
    console.log(`Fetching templates for ${app.name}...`)
    const templates = await fetchTemplates(app.id, app.key)
    console.log(`  found ${templates.length}`)

    for (const t of templates) {
      const key = slugify(t.name)
      const existing = await payload.find({
        collection: 'template-mappings',
        where: { templateKey: { equals: key } },
        limit: 1,
      })
      if (existing.docs.length) {
        await payload.update({
          collection: 'template-mappings',
          id: existing.docs[0].id,
          overrideAccess: true,
          data: { [app.field]: t.id, family: familyOf(t.name) } as any,
        })
        updated++
      } else {
        await payload.create({
          collection: 'template-mappings',
          overrideAccess: true,
          data: {
            templateKey: key,
            templateName: t.name,
            family: familyOf(t.name),
            [app.field]: t.id,
          } as any,
        })
        created++
      }
    }
  }

  console.log(`\n✅ Sync done. Created ${created}, updated ${updated} template mappings.`)
  console.log(
    "   Tip: templates whose names differ across apps won't auto-unite — merge them manually in /admin if needed.",
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
