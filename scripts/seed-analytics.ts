/**
 * Seed MOCK analytics data (AnalyticsDaily + TemplateMappings + demo Campaigns).
 *
 * Run with:  node --import tsx scripts/seed-analytics.ts
 * Idempotent-ish: clears analytics-daily, template-mappings, campaigns first, then reseeds.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

const REGIONS = ['Brazil', 'South Africa', 'INT', 'MENA', 'LATAM', 'ROW']
const DAYS_BACK = 365

const TEMPLATES = [
  { key: 'welcome_day0', name: 'Day 0 Welcome', both: true, quality: 0.72 },
  { key: 'reminder_1', name: 'Reminder 1', both: true, quality: 0.58 },
  { key: 'reminder_2', name: 'Reminder 2', both: false, quality: 0.66 },
  { key: 'final_reminder', name: 'Final Reminder', both: false, quality: 0.49 },
  { key: 'japan_peska', name: 'Japan - Peska', both: false, quality: 0.61 },
  { key: 'cashback_promo', name: 'Cashback Promo', both: true, quality: 0.77 },
]

// Demo campaigns → which template keys belong to each
const CAMPAIGNS = [
  {
    name: 'Onboarding Journey',
    description: 'New client welcome + reminder sequence',
    color: '#075c8f',
    keys: ['welcome_day0', 'reminder_1', 'reminder_2', 'final_reminder'],
  },
  {
    name: 'Summer Promo',
    description: 'Seasonal promotional pushes',
    color: '#84c561',
    keys: ['cashback_promo', 'japan_peska'],
  },
  {
    name: 'Japan Market',
    description: 'Japan-specific campaigns',
    color: '#7c3aed',
    keys: ['japan_peska'],
  },
]

const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min))
const jitter = (base: number, spread = 0.12) => base * (1 - spread + Math.random() * spread * 2)

const run = async () => {
  const payload = await getPayload({ config })

  // Clear campaigns → template-mappings → analytics-daily (order matters for relationships)
  const clearAll = async (slug: string) => {
    let n = 0
    while (true) {
      const b = await payload.find({ collection: slug as any, limit: 100 })
      if (b.docs.length === 0) break
      for (const d of b.docs) {
        await payload.delete({ collection: slug as any, id: d.id, overrideAccess: true })
        n++
      }
    }
    return n
  }
  payload.logger.info('Clearing old campaigns / mappings / daily...')
  await clearAll('campaigns')
  await clearAll('template-mappings')
  await clearAll('analytics-daily')

  // Template mappings — keep the created ids to link campaigns
  payload.logger.info('Seeding template mappings...')
  const keyToId: Record<string, string | number> = {}
  for (const t of TEMPLATES) {
    const doc = await payload.create({
      collection: 'template-mappings',
      overrideAccess: true,
      data: {
        templateKey: t.key,
        templateName: t.name,
        globalTemplateId: `glob-${t.key}-${rnd(1000, 9999)}`,
        chinaTemplateId: t.both ? `chin-${t.key}-${rnd(1000, 9999)}` : undefined,
      },
    })
    keyToId[t.key] = doc.id
  }

  // Campaigns
  payload.logger.info('Seeding demo campaigns...')
  for (const c of CAMPAIGNS) {
    await payload.create({
      collection: 'campaigns',
      overrideAccess: true,
      data: {
        name: c.name,
        description: c.description,
        status: 'active',
        color: c.color,
        templates: c.keys.map((k) => keyToId[k]).filter(Boolean),
      } as any,
    })
  }

  // Daily rollups — 1 year
  payload.logger.info(`Generating mock rollups (${DAYS_BACK} days)...`)
  const today = new Date()
  const rows: any[] = []
  for (let dayAgo = DAYS_BACK; dayAgo >= 0; dayAgo--) {
    const date = new Date(today)
    date.setDate(today.getDate() - dayAgo)
    date.setHours(9, 0, 0, 0)
    for (const t of TEMPLATES) {
      if (Math.random() > 0.4) continue
      const apps: Array<{ source: string; channel: 'email' | 'push' }> = [
        { source: 'mailgun', channel: 'email' },
        { source: 'onesignal_global', channel: 'push' },
      ]
      if (t.both && Math.random() > 0.5) apps.push({ source: 'onesignal_china', channel: 'push' })
      for (const app of apps) {
        const region = REGIONS[rnd(0, REGIONS.length - 1)]
        const sent = rnd(300, 1200)
        const delivered = Math.round(
          sent * (app.channel === 'email' ? jitter(0.965) : jitter(0.92)),
        )
        const uniqueOpens = Math.round(delivered * jitter(t.quality))
        const totalOpens = Math.round(uniqueOpens * jitter(1.6))
        const uniqueClicks = Math.round(uniqueOpens * jitter(0.28))
        const totalClicks = Math.round(uniqueClicks * jitter(1.3))
        rows.push({
          date: date.toISOString(),
          channel: app.channel,
          source: app.source,
          templateKey: t.key,
          templateName: t.name,
          region,
          sent,
          delivered,
          uniqueOpens,
          totalOpens,
          uniqueClicks,
          totalClicks,
          hardBounces: Math.round(sent * jitter(0.006)),
          softBounces: Math.round(sent * jitter(0.012)),
          complaints: Math.round(delivered * jitter(0.0006)),
          unsubscribes: Math.round(delivered * jitter(0.004)),
          failed: app.channel === 'push' ? Math.round(sent * jitter(0.03)) : 0,
        })
      }
    }
  }
  for (const r of rows)
    await payload.create({ collection: 'analytics-daily', data: r, overrideAccess: true })
  payload.logger.info(
    `Seeded ${rows.length} rollup rows + ${CAMPAIGNS.length} campaigns across ${DAYS_BACK} days.`,
  )
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
