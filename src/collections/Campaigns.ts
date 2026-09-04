import type { CollectionConfig } from 'payload'

// User-managed campaigns: a container you create and assign templates to.
// Many-to-many — a template can belong to multiple campaigns.
// Manage these either from the Payload admin or from the in-app Analytics Campaign Builder.
const Campaigns: CollectionConfig = {
  slug: 'campaigns',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'status', 'updatedAt'],
    group: 'Analytics',
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user?.superAdmin || user?.department === 'marketing'),
    update: ({ req: { user } }) => Boolean(user?.superAdmin || user?.department === 'marketing'),
    delete: ({ req: { user } }) => Boolean(user?.superAdmin),
  },
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context?.skipAnalyticsAudit) return doc
        const actor: any = req.user
        const previousStatus = previousDoc?.status
        const nextStatus = doc?.status
        const requestedAction = req.headers?.get?.('x-analytics-action')
        let action = operation === 'create' ? 'created' : 'updated'
        if (operation === 'create' && requestedAction === 'duplicated') action = 'duplicated'
        if (operation === 'update' && previousStatus !== nextStatus && nextStatus === 'archived')
          action = 'archived'
        if (operation === 'update' && previousStatus === 'archived' && nextStatus !== 'archived')
          action = 'restored'
        try {
          await (req.payload as any).create({
            collection: 'analytics-audit-logs',
            overrideAccess: true,
            req,
            context: { skipAnalyticsAudit: true },
            data: {
              action,
              entityType: 'campaign',
              entityId: String(doc?.id || ''),
              entityName: doc?.name || '',
              summary:
                `${actor?.name || actor?.username || 'System'} ${action} campaign ${doc?.name || ''}`.trim(),
              actor: actor?.id || undefined,
              actorName: actor?.name || actor?.username || 'System',
              detail: {
                previousStatus: previousStatus || null,
                status: nextStatus || null,
                templateCount: Array.isArray(doc?.templates) ? doc.templates.length : 0,
              },
            },
          })
        } catch {
          // Audit logging must never block a campaign write.
        }
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const actor: any = req.user
        try {
          await (req.payload as any).create({
            collection: 'analytics-audit-logs',
            overrideAccess: true,
            req,
            data: {
              action: 'deleted',
              entityType: 'campaign',
              entityId: String(doc?.id || ''),
              entityName: doc?.name || '',
              summary:
                `${actor?.name || actor?.username || 'System'} deleted campaign ${doc?.name || ''}`.trim(),
              actor: actor?.id || undefined,
              actorName: actor?.name || actor?.username || 'System',
            },
          })
        } catch {}
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'e.g. Q3 Onboarding, Summer Promo.' },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'notes',
      type: 'textarea',
      admin: { description: 'Internal campaign notes and handoff context.' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
        { label: 'Completed', value: 'completed' },
        { label: 'Archived', value: 'archived' },
      ],
    },
    {
      name: 'templates',
      type: 'relationship',
      relationTo: 'template-mappings',
      hasMany: true,
      admin: {
        description:
          'Assign one or more templates to this campaign. A template can be in several campaigns.',
      },
    },
    {
      name: 'color',
      type: 'text',
      admin: { description: 'Optional hex color for charts, e.g. #075c8f.' },
    },
  ],
}

export default Campaigns
