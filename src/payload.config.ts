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
// Analytics collections
import Events from './collections/Events'
import AnalyticsDaily from './collections/AnalyticsDaily'
import { TemplateMappings, NotificationsCache } from './collections/AnalyticsSupport'
import Campaigns from './collections/Campaigns'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

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
    // Analytics
    Events,
    AnalyticsDaily,
    TemplateMappings,
    NotificationsCache,
    Campaigns,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})