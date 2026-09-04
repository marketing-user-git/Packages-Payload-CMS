import type { CollectionConfig } from 'payload'

const canRead = (user: any) => Boolean(user?.superAdmin || user?.department === 'marketing')

const AnalyticsAuditLogs: CollectionConfig = {
  slug: 'analytics-audit-logs',
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['action', 'entityType', 'entityName', 'actorName', 'createdAt'],
    group: 'Analytics',
  },
  access: {
    read: ({ req: { user } }) => canRead(user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  fields: [
    {
      name: 'action',
      type: 'select',
      required: true,
      options: [
        { label: 'Created', value: 'created' },
        { label: 'Updated', value: 'updated' },
        { label: 'Archived', value: 'archived' },
        { label: 'Restored', value: 'restored' },
        { label: 'Duplicated', value: 'duplicated' },
        { label: 'Deleted', value: 'deleted' },
        { label: 'View saved', value: 'view_saved' },
        { label: 'View deleted', value: 'view_deleted' },
      ],
    },
    { name: 'entityType', type: 'text', required: true },
    { name: 'entityId', type: 'text' },
    { name: 'entityName', type: 'text' },
    { name: 'summary', type: 'text', required: true },
    { name: 'actor', type: 'relationship', relationTo: 'users' },
    { name: 'actorName', type: 'text' },
    { name: 'detail', type: 'json' },
  ],
}

export default AnalyticsAuditLogs
