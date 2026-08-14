import { CollectionConfig } from 'payload'

const Reports: CollectionConfig = {
  slug: 'reports',
  access: {
    read: () => true,
    update: () => true,
  },
  admin: {
    useAsTitle: 'templateName',
    defaultColumns: ['clientId', 'region', 'pkg', 'status', 'contacted', 'deposited'],
  },
  fields: [
    { name: 'weekOf',        type: 'date',   required: true, label: 'Week Of' },
    { name: 'templateId',    type: 'text',   label: 'Template ID' },
    { name: 'templateName',  type: 'text',   label: 'Template Name' },
    { name: 'region',        type: 'select', label: 'Region',
      options: ['Brazil','South Africa','INT','MENA','LATAM','ROW'] },
    { name: 'msgType',       type: 'select', label: 'Message Type',
      options: ['Email','Push'] },
    { name: 'sent',          type: 'number', label: 'Sent' },
    { name: 'delivered',     type: 'number', label: 'Delivered' },
    { name: 'delivPct',      type: 'number', label: 'Delivery %' },
    { name: 'opened',        type: 'number', label: 'Opened' },
    { name: 'openPct',       type: 'number', label: 'Open Rate %' },
    { name: 'clicked',       type: 'number', label: 'Clicked' },
    { name: 'ctr',           type: 'number', label: 'CTR %' },
    { name: 'unsub',         type: 'number', label: 'Unsubscribed' },
    { name: 'unsubPct',      type: 'number', label: 'Unsub %' },
    { name: 'failed',        type: 'number', label: 'Failed' },
  ],
}

export default Reports