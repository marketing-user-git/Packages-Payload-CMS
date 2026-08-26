import type { CollectionConfig } from 'payload'

// User-managed campaigns: a container you create and assign templates to.
// Many-to-many — a template can belong to multiple campaigns.
// Manage these from the Payload admin (/admin → Campaigns → Create New) for now;
// a custom in-app builder can come later.
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
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'e.g. Q3 Onboarding, Summer Promo.' },
    },
    { name: 'description', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Paused', value: 'paused' },
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
