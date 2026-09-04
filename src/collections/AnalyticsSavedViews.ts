import type { Access, CollectionConfig, Where } from 'payload'

const canUseAnalytics = (user: any) => Boolean(user?.superAdmin || user?.department === 'marketing')

const readAccess: Access = ({ req }) => {
  const user = req.user

  if (!user) return false
  if (!canUseAnalytics(user)) return false

  if (user.superAdmin) return true

  const conditions: Where[] = [
    {
      visibility: {
        equals: 'team',
      },
    },
    {
      owner: {
        equals: user.id,
      },
    },
  ]

  return {
    or: conditions,
  }
}

const ownerAccess: Access = ({ req }) => {
  const user = req.user

  if (!user) return false
  if (!canUseAnalytics(user)) return false

  if (user.superAdmin) return true

  return {
    owner: {
      equals: user.id,
    },
  }
}

const AnalyticsSavedViews: CollectionConfig = {
  slug: 'analytics-saved-views',

  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'visibility', 'owner', 'updatedAt'],
    group: 'Analytics',
  },

  access: {
    read: readAccess,

    create: ({ req }) => {
      const user = req.user

      if (!user) return false

      return canUseAnalytics(user)
    },

    update: ownerAccess,
    delete: ownerAccess,
  },

  hooks: {
    beforeValidate: [
      ({ data, operation, req }) => {
        const user = req.user

        if (operation === 'create' && user && data && !data.owner) {
          return {
            ...data,
            owner: user.id,
          }
        }

        return data
      },
    ],

    afterChange: [
      async ({ doc, operation, req }) => {
        const actor: any = req.user

        try {
          await (req.payload as any).create({
            collection: 'analytics-audit-logs',
            overrideAccess: true,
            req,

            data: {
              action: 'view_saved',
              entityType: 'saved_view',

              entityId: String(doc?.id || ''),
              entityName: doc?.name || '',

              summary: `${actor?.name || actor?.username || 'System'} ${
                operation === 'create' ? 'saved' : 'updated'
              } analytics view ${doc?.name || ''}`.trim(),

              actor: actor?.id || undefined,

              actorName: actor?.name || actor?.username || 'System',

              detail: {
                visibility: doc?.visibility,
                tab: doc?.tab,
              },
            },
          })
        } catch (error) {
          console.error('Failed to create saved-view audit log:', error)
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
              action: 'view_deleted',
              entityType: 'saved_view',

              entityId: String(doc?.id || ''),
              entityName: doc?.name || '',

              summary: `${actor?.name || actor?.username || 'System'} deleted analytics view ${
                doc?.name || ''
              }`.trim(),

              actor: actor?.id || undefined,

              actorName: actor?.name || actor?.username || 'System',
            },
          })
        } catch (error) {
          console.error('Failed to create saved-view delete audit log:', error)
        }

        return doc
      },
    ],
  },

  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },

    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,

      admin: {
        readOnly: true,
      },
    },

    {
      name: 'visibility',
      type: 'select',
      defaultValue: 'personal',

      options: [
        {
          label: 'Personal',
          value: 'personal',
        },
        {
          label: 'Team',
          value: 'team',
        },
      ],
    },

    {
      name: 'tab',
      type: 'text',
      defaultValue: 'Overview',
    },

    {
      name: 'days',
      type: 'number',
      defaultValue: 90,
    },

    {
      name: 'campaign',
      type: 'text',
      defaultValue: 'All',
    },

    {
      name: 'channel',
      type: 'text',
      defaultValue: 'All',
    },

    {
      name: 'region',
      type: 'text',
      defaultValue: 'All',
    },
  ],
}

export default AnalyticsSavedViews
