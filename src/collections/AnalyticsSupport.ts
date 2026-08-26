import type { CollectionConfig } from 'payload'

// Canonical template mapping — unites the "same" template across the two OneSignal apps.
// e.g. welcome_bronze → { global: "abc-111", china: "xyz-222" }
// This is what lets you aggregate a template across both apps.
export const TemplateMappings: CollectionConfig = {
  slug: 'template-mappings',
  admin: {
    useAsTitle: 'templateKey',
    defaultColumns: ['templateKey', 'templateName', 'globalTemplateId', 'chinaTemplateId'],
    group: 'Analytics',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user?.superAdmin),
    update: ({ req: { user } }) => Boolean(user?.superAdmin),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  fields: [
    {
      name: 'templateKey',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Canonical key, e.g. welcome_bronze.' },
    },
    { name: 'templateName', type: 'text', required: true },
    {
      name: 'family',
      type: 'text',
      index: true,
      admin: {
        description:
          'Auto-derived group (prefix before the first " - "). Used for the Family view.',
      },
    },
    {
      name: 'globalTemplateId',
      type: 'text',
      admin: { description: 'Raw template id in the global OneSignal app.' },
    },
    {
      name: 'chinaTemplateId',
      type: 'text',
      admin: { description: 'Raw template id in the China OneSignal app.' },
    },
  ],
}

// Cache: notification_id → resolved template + app.
// Lets the webhook enrichment hit the OneSignal API only ONCE per notification.
export const NotificationsCache: CollectionConfig = {
  slug: 'notifications-cache',
  admin: {
    useAsTitle: 'notificationId',
    defaultColumns: ['notificationId', 'source', 'templateKey', 'firstSeen'],
    group: 'Analytics',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user?.superAdmin),
    update: ({ req: { user } }) => Boolean(user?.superAdmin),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  indexes: [{ fields: ['notificationId'] }],
  fields: [
    { name: 'notificationId', type: 'text', required: true, unique: true },
    { name: 'source', type: 'select', options: ['onesignal_global', 'onesignal_china'] },
    { name: 'appId', type: 'text' },
    { name: 'templateId', type: 'text' },
    { name: 'templateKey', type: 'text' },
    { name: 'firstSeen', type: 'date' },
  ],
}
