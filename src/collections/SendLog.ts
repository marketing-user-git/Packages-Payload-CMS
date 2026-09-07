import type { CollectionConfig } from 'payload'

const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

/**
 * SendLog — one row per send attempt.
 * Carries the notificationId that BRIDGES to the analytics `Events` collection
 * (Events ⋈ SendLog on notificationId) so engagement can be split by variant/step/osApp.
 *
 * Idempotency: a given (externalId, stepId) must be 'sent' at most once. Payload
 * cannot declare a *partial* unique index, so:
 *   1) the sender workflow guards on SendLog before every send, AND
 *   2) add the DB-level backstop below via a migration (recommended):
 *      CREATE UNIQUE INDEX uq_sendlog_sent_once
 *        ON send_log (external_id, step_id) WHERE result = 'sent';
 */
export const SendLog: CollectionConfig = {
  slug: 'send-log',
  labels: { singular: 'Send Log', plural: 'Send Log' },
  admin: {
    group: 'RegFunnelOps',
    useAsTitle: 'externalId',
    defaultColumns: ['externalId', 'stepId', 'variant', 'osApp', 'result', 'attemptedAt'],
  },
  access: { read: isInternal, create: isInternal, update: isInternal, delete: isInternal },
  indexes: [ { fields: ['externalId', 'stepId'] } ],
  fields: [
    { name: 'externalId', type: 'text', required: true, index: true },
    { name: 'stepId', type: 'text', required: true, index: true },
    { name: 'variant', type: 'select',
      options: [ { label: 'A', value: 'A' }, { label: 'B', value: 'B' } ] },
    { name: 'osApp', type: 'select', index: true,
      options: [ { label: 'Global', value: 'global' }, { label: 'China', value: 'china' } ],
      admin: { description: 'Which OneSignal app sent it (matches NotificationsCache.source).' } },
    { name: 'templateId', type: 'text' },
    { name: 'notificationId', type: 'text', index: true,
      admin: { description: 'OneSignal notification_id — join key to analytics Events.' } },
    { name: 'attemptedAt', type: 'date', required: true },
    { name: 'result', type: 'select', required: true, index: true,
      options: [
        { label: 'Sent', value: 'sent' },
        { label: 'Skipped — converted', value: 'skipped_converted' },
        { label: 'Skipped — no recipient', value: 'skipped_no_recipient' },
        { label: 'Error', value: 'error' },
      ] },
    { name: 'errorDetail', type: 'textarea' },
  ],
}

export default SendLog
