import type { CollectionConfig } from 'payload'

const isInternal = ({ req }: { req: any }) =>
  Boolean(req?.user?.superAdmin) || req?.user?.department === 'marketing'

/**
 * FunnelEnrollment — one row per registered user in the RegFunnelOps funnel.
 * Source of truth for funnel state (who is where, which variant, when next).
 *
 * Two independent axes (do not conflate):
 *   funnelRegion (ROW|CNJP) -> WHICH emails (15 vs 10). From KYC country.
 *   osApp        (global|china) -> WHICH OneSignal app/credentials/template UUID.
 *                                   china ONLY when country === China. Japan -> global.
 */
export const FunnelEnrollment: CollectionConfig = {
  slug: 'funnel-enrollment',
  labels: { singular: 'Funnel Enrollment', plural: 'Funnel Enrollments' },
  admin: {
    group: 'RegFunnelOps',
    useAsTitle: 'externalId',
    defaultColumns: ['externalId', 'country', 'osApp', 'funnelRegion', 'variant', 'state', 'currentStep', 'nextSendAt'],
  },
  access: { read: isInternal, create: isInternal, update: isInternal, delete: isInternal },
  hooks: {
    beforeChange: [
      // When state first flips to converted, stamp the last actually-sent step
      // and the conversion timestamp. This keeps conversion attribution stable
      // regardless of which orchestration path performs the state transition.
      ({ data, originalDoc }) => {
        const wasConverted = originalDoc?.state === 'converted'

        if (data?.state === 'converted' && !wasConverted) {
          const incomingStep =
            typeof data.convertedAtStep === 'string'
              ? data.convertedAtStep.trim()
              : data.convertedAtStep

          data.convertedAtStep = incomingStep || originalDoc?.lastSentStep || '00_no_email_yet'
          data.convertedAt = data.convertedAt || new Date().toISOString()
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
      admin: { description: 'Canonical OneSignal external_id. Unique -> enrollment idempotency.' },
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
      admin: { description: 'Which sequence: ROW=15 emails, CNJP=10 (China OR Japan).' },
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
        description: 'Sequence-level variant, assigned once at enrollment and kept stable.',
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
        { label: 'Excluded', value: 'excluded' },
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
}

export default FunnelEnrollment
