import type { CollectionConfig } from 'payload'

// Pre-aggregated daily rollup — one row per (date × channel × source × template × region).
// This is what the Analytics dashboard reads: fast, small, chart-ready.
// Populated by mock seed now; by a scheduled rollup job over Events later.
const AnalyticsDaily: CollectionConfig = {
  slug: 'analytics-daily',
  admin: {
    useAsTitle: 'templateName',
    defaultColumns: ['date', 'channel', 'source', 'templateName', 'region', 'sent', 'delivered'],
    group: 'Analytics',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user?.superAdmin),
    update: ({ req: { user } }) => Boolean(user?.superAdmin),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  indexes: [
    { fields: ['date'] },
    { fields: ['channel', 'date'] },
    { fields: ['templateKey', 'date'] },
  ],
  fields: [
    { name: 'date', type: 'date', required: true, index: true },
    { name: 'channel', type: 'select', required: true, options: ['email', 'push'] },
    { name: 'source', type: 'select', required: true, options: ['mailgun', 'onesignal_global', 'onesignal_china'] },
    { name: 'templateKey', type: 'text', index: true },
    { name: 'templateName', type: 'text' },
    { name: 'region', type: 'text' },
    // Counts (all integers)
    { name: 'sent', type: 'number', defaultValue: 0 },
    { name: 'delivered', type: 'number', defaultValue: 0 },
    { name: 'uniqueOpens', type: 'number', defaultValue: 0 },
    { name: 'totalOpens', type: 'number', defaultValue: 0 },
    { name: 'uniqueClicks', type: 'number', defaultValue: 0 },
    { name: 'totalClicks', type: 'number', defaultValue: 0 },
    { name: 'hardBounces', type: 'number', defaultValue: 0 },
    { name: 'softBounces', type: 'number', defaultValue: 0 },
    { name: 'complaints', type: 'number', defaultValue: 0 },
    { name: 'unsubscribes', type: 'number', defaultValue: 0 },
    { name: 'failed', type: 'number', defaultValue: 0 },
  ],
}

export default AnalyticsDaily