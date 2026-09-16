import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import Clients from './collections/Clients'
import JourneyTracking from './collections/JourneyTracking'
import Reports from './collections/Reports'
import Events from './collections/Events'
import AnalyticsDaily from './collections/AnalyticsDaily'
import { TemplateMappings, NotificationsCache } from './collections/AnalyticsSupport'
import Campaigns from './collections/Campaigns'
import AnalyticsSavedViews from './collections/AnalyticsSavedViews'
import AnalyticsAuditLogs from './collections/AnalyticsAuditLogs'
import FunnelEnrollment from './collections/FunnelEnrollment'
import SendLog from './collections/SendLog'
import FunnelConfig from './globals/FunnelConfig'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const productionRequiredEnv = [
  'PAYLOAD_SECRET',
  'DATABASE_URL',
  'MAILGUN_SIGNING_KEY',
  'ONESIGNAL_GLOBAL_APP_ID',
  'ONESIGNAL_GLOBAL_REST_KEY',
  'ONESIGNAL_CHINA_APP_ID',
  'ONESIGNAL_CHINA_REST_KEY',
  'WEBHOOK_SHARED_SECRET',
] as const

if (process.env.NODE_ENV === 'production') {
  const missing = productionRequiredEnv.filter((name) => !process.env[name]?.trim())
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }
}

const payloadSecret = process.env.PAYLOAD_SECRET?.trim() || 'local-dev-only-payload-secret'
const databaseUrl = process.env.DATABASE_URL?.trim() || ''

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Clients,
    JourneyTracking,
    Reports,
    Events,
    AnalyticsDaily,
    TemplateMappings,
    NotificationsCache,
    Campaigns,
    AnalyticsSavedViews,
    AnalyticsAuditLogs,
    FunnelEnrollment,
    SendLog,
  ],
  globals: [FunnelConfig],
  editor: lexicalEditor(),
  secret: payloadSecret,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: databaseUrl,
    },
  }),
  sharp,
  plugins: [],
})
