import { CollectionConfig } from 'payload'

const JourneyTracking: CollectionConfig = {
  slug: 'journey-tracking',
  access: {
    read: () => true,
    update: () => true,
  },
  admin: {
    useAsTitle: 'externalId',
    defaultColumns: ['externalId', 'region', 'journeyStatus', 'formSubmitted', 'path2Step'],
  },
  fields: [
    { name: 'externalId',       type: 'text', required: true, unique: true, label: 'External ID (OneSignal)' },
    { name: 'region',           type: 'select', label: 'Region',
      options: ['Brazil','South Africa','INT','MENA','LATAM','ROW'] },
    { name: 'journeyStatus',    type: 'select', defaultValue: 'Active', label: 'Journey Status',
      options: ['Active','Converted','Completed','Excluded'] },
    { name: 'journeyStartedAt', type: 'date',   label: 'Journey Started At' },
    { name: 'journeyEndedAt',   type: 'date',   label: 'Journey Ended At' },
    { name: 'exitReason',       type: 'text',   label: 'Exit Reason' },
    { name: 'formSubmitted',    type: 'checkbox', defaultValue: false, label: 'Form Submitted' },
    { name: 'formSubmittedAt',  type: 'date',   label: 'Form Submitted At' },
    // Segment A (Non-Engaged)
    { name: 'path2Step',        type: 'text',   label: 'Path 2 Step (NE)' },
    { name: 'path2LastSendAt',  type: 'date',   label: 'Path 2 Last Send At' },
    { name: 'day0SentAt',       type: 'date',   label: 'Day 0 Sent At' },
    // Segment B (Engaged)
    { name: 'path1Step',        type: 'text',   label: 'Path 1 Step (Engaged)' },
    { name: 'path1LastSendAt',  type: 'date',   label: 'Path 1 Last Send At' },
    { name: 'path1ThankyouSentAt', type: 'date', label: 'Thank You Sent At' },
  ],
}

export default JourneyTracking