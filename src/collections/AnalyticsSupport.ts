import type { CollectionConfig } from 'payload'

const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

// Canonical template mapping — unites the same template across the two OneSignal apps.
export const TemplateMappings: CollectionConfig = {
  slug: 'template-mappings',
  admin: {
    useAsTitle: 'templateKey',
    defaultColumns: ['templateKey', 'templateName', 'globalTemplateId', 'chinaTemplateId'],
    group: 'Analytics',
  },
  access: {
    read: isInternal,
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
      admin: { description: 'Canonical template key.' },
    },
    { name: 'templateName', type: 'text', required: true },
    {
      name: 'family',
      type: 'text',
      index: true,
      admin: {
        description: 'Auto-derived template family used by Analytics.',
      },
    },
    {
      name: 'globalTemplateId',
      type: 'text',
      admin: { description: 'Raw template ID in the Global OneSignal app.' },
    },
    {
      name: 'chinaTemplateId',
      type: 'text',
      admin: { description: 'Raw template ID in the China OneSignal app.' },
    },
  ],
}

// Cache: notification_id → resolved template + app.
// Lets webhook enrichment hit the OneSignal API only once per notification.
export const NotificationsCache: CollectionConfig = {
  slug: 'notifications-cache',
  admin: {
    useAsTitle: 'notificationId',
    defaultColumns: ['notificationId', 'source', 'templateKey', 'firstSeen'],
    group: 'Analytics',
  },
  access: {
    read: isInternal,
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
