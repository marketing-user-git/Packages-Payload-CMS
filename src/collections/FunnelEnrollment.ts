import type { CollectionConfig } from 'payload'

// Internal-only access, mirroring the app's existing gate
// (superAdmin OR department === 'marketing'). Tighten per your auth model.
const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

/**
 * FunnelEnrollment — one row per registered user in the RegFunnelOps funnel.
 * Source of truth for funnel STATE (who is where, which variant, when next).
 *
 * Two independent axes (do not conflate):
 *   funnelRegion (ROW|CNJP) -> WHICH emails (16 vs 11, restricted list). From KYC country.
 *   osApp        (global|china) -> WHICH OneSignal app/credentials/template UUID.
 *                                   china ONLY when country === China. Japan -> global.
 */
export const FunnelEnrollment: CollectionConfig = {
  slug: 'funnel-enrollment',
  labels: { singular: 'Funnel Enrollment', plural: 'Funnel Enrollments' },
  admin: {
    group: 'RegFunnelOps',
    useAsTitle: 'externalId',
    defaultColumns: ['externalId', 'funnelRegion', 'variant', 'state', 'currentStep', 'nextSendAt'],
  },
  access: { read: isInternal, create: isInternal, update: isInternal, delete: isInternal },
  hooks: {
    beforeChange: [
      // When state flips to 'converted', stamp the step actually reached and the
      // timestamp. Keeps convertedAtStep correct no matter who flips it
      // (CRM conversion webhook OR the sender's pre-send STATUS guard).
      ({ data, originalDoc }) => {
        const wasConverted = originalDoc?.state === 'converted'
        if (data?.state === 'converted' && !wasConverted) {
          data.convertedAtStep =
            data.convertedAtStep ?? originalDoc?.lastSentStep ?? '00_no_email_yet'
          data.convertedAt = data.convertedAt ?? new Date().toISOString()
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'externalId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'CRM external_id. Unique -> enrollment idempotency.' },
    },

    {
      name: 'country',
      type: 'text',
      admin: { description: 'KYC country (source for region + osApp).' },
    },
    {
      name: 'culture',
      type: 'text',
      admin: { description: 'OneSignal Culture tag, e.g. Int-en. Used by step/exclusion rules.' },
    },
    { name: 'language', type: 'text' },

    {
      name: 'funnelRegion',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'ROW', value: 'ROW' },
        { label: 'CN/JP', value: 'CNJP' },
      ],
      admin: { description: 'Which sequence: ROW=16 emails, CNJP=11 (China OR Japan).' },
    },

    {
      name: 'osApp',
      type: 'select',
      required: true,
      index: true,
      defaultValue: 'global',
      options: [
        { label: 'Global', value: 'global' },
        { label: 'China', value: 'china' },
      ],
      admin: {
        description:
          'Which OneSignal app to send from. china ONLY for country===China; Japan uses global.',
      },
    },

    {
      name: 'variant',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'A', value: 'A' },
        { label: 'B', value: 'B' },
      ],
      admin: {
        description:
          'Sequence-level A/B, assigned once at enrollment. Stable for the whole funnel.',
      },
    },

    {
      name: 'state',
      type: 'select',
      required: true,
      defaultValue: 'in_progress',
      index: true,
      options: [
        { label: 'In progress', value: 'in_progress' },
        { label: 'Converted', value: 'converted' },
        { label: 'Completed', value: 'completed' },
      ],
    },

    { name: 'currentStep', type: 'text', defaultValue: '00_no_email_yet' },
    { name: 'lastSentStep', type: 'text' },
    {
      name: 'sendIndex',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { description: '0-based index of the NEXT send.' },
    },

    { name: 'enrolledAt', type: 'date', required: true },
    {
      name: 'nextSendAt',
      type: 'date',
      index: true,
      admin: {
        description: 'When the next send is due. Sender tick selects rows where this <= now.',
      },
    },
    { name: 'convertedAt', type: 'date' },
    {
      name: 'convertedAtStep',
      type: 'text',
      admin: { description: 'Last email ACTUALLY sent before conversion.' },
    },
    { name: 'completedAt', type: 'date' },

    { name: 'paused', type: 'checkbox', defaultValue: false, index: true },
    { name: 'excluded', type: 'checkbox', defaultValue: false, index: true },
  ],
  // createdAt / updatedAt are added automatically by Payload.
}

export default FunnelEnrollment
