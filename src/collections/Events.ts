import type { CollectionConfig } from 'payload'

// Raw analytics events — the source of truth.
// Fed by the Mailgun/OneSignal webhook routes (built in the next step).
// The dashboard does NOT read this directly at scale — it reads AnalyticsDaily (rollup).
const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'messageId',
    defaultColumns: ['channel', 'source', 'eventType', 'templateKey', 'recipient', 'timestamp'],
    group: 'Analytics',
  },
  access: {
    read: () => true, // consistent with existing collections; tighten later if needed
    create: ({ req: { user } }) => Boolean(user?.superAdmin), // webhooks use overrideAccess
    update: ({ req: { user } }) => Boolean(user?.superAdmin),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  indexes: [
    { fields: ['timestamp'] },
    { fields: ['channel', 'timestamp'] },
    { fields: ['templateKey', 'timestamp'] },
    { fields: ['messageId', 'eventType'] }, // dedup lookups
  ],
  fields: [
    { name: 'channel', type: 'select', required: true, options: ['email', 'push'] },
    {
      name: 'source', type: 'select', required: true,
      options: ['mailgun', 'onesignal_global', 'onesignal_china'],
      admin: { description: 'Which system produced the event. Email=mailgun (source of truth); push=onesignal_*.' },
    },
    {
      name: 'eventType', type: 'select', required: true,
      options: ['accepted', 'delivered', 'opened', 'clicked', 'bounced_hard', 'bounced_soft', 'complained', 'unsubscribed', 'failed'],
    },
    { name: 'recipient', type: 'text', index: true, admin: { description: 'Email address or push player_id.' } },
    { name: 'messageId', type: 'text', index: true, admin: { description: 'Mailgun message-id — stable per email, used for dedup.' } },
    { name: 'notificationId', type: 'text', index: true, admin: { description: 'OneSignal notification_id — key to resolve template.' } },
    { name: 'templateKey', type: 'text', admin: { description: 'Canonical template key (resolved via TemplateMappings).' } },
    { name: 'templateId', type: 'text', admin: { description: 'Raw per-app template id.' } },
    { name: 'region', type: 'text' },
    { name: 'timestamp', type: 'date', required: true, index: true },
    { name: 'isUnique', type: 'checkbox', defaultValue: false, admin: { description: 'First open/click for this recipient+message (for unique-rate math).' } },
    { name: 'metadata', type: 'json', admin: { description: 'Raw provider payload snippet (geo, client, etc).' } },
  ],
}

export default Events