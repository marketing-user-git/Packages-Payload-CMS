import type { CollectionConfig } from 'payload'

const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

// Raw analytics events — the source of truth for delivery and engagement.
// Fed by Mailgun and OneSignal Event Streams. Dashboard/API access remains internal-only.
const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'messageId',
    defaultColumns: ['channel', 'source', 'eventType', 'templateKey', 'recipient', 'timestamp'],
    group: 'Analytics',
  },
  access: {
    read: isInternal,
    create: ({ req: { user } }) => Boolean(user?.superAdmin), // webhooks use overrideAccess
    update: ({ req: { user } }) => Boolean(user?.superAdmin),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  indexes: [
    { fields: ['timestamp'] },
    { fields: ['channel', 'timestamp'] },
    { fields: ['templateKey', 'timestamp'] },
    { fields: ['messageId', 'eventType'] },
  ],
  fields: [
    { name: 'channel', type: 'select', required: true, options: ['email', 'push'] },
    {
      name: 'source', type: 'select', required: true,
      options: ['mailgun', 'onesignal_global', 'onesignal_china'],
      admin: { description: 'Provider/source that produced the event.' },
    },
    {
      name: 'eventType', type: 'select', required: true,
      options: ['accepted', 'delivered', 'opened', 'clicked', 'bounced_hard', 'bounced_soft', 'complained', 'unsubscribed', 'failed'],
    },
    { name: 'recipient', type: 'text', index: true, admin: { description: 'Email address or push subscription target.' } },
    { name: 'messageId', type: 'text', index: true, admin: { description: 'Provider event/message key used for deduplication.' } },
    { name: 'notificationId', type: 'text', index: true, admin: { description: 'OneSignal message/notification ID — join key to SendLog.' } },
    { name: 'templateKey', type: 'text', admin: { description: 'Canonical template key.' } },
    { name: 'templateId', type: 'text', admin: { description: 'Raw provider template ID.' } },
    { name: 'region', type: 'text' },
    { name: 'timestamp', type: 'date', required: true, index: true },
    { name: 'isUnique', type: 'checkbox', defaultValue: false, admin: { description: 'First open/click for this recipient+message.' } },
    { name: 'metadata', type: 'json', admin: { description: 'Provider payload/context.' } },
  ],
}

export default Events
