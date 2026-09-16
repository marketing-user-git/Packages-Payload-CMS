import type { Access, CollectionConfig } from 'payload'

// Region options — kept in sync with Clients.ts
const REGION_OPTIONS = ['Brazil', 'South Africa', 'INT', 'MENA', 'LATAM', 'ROW']

// ── Access helpers ────────────────────────────────────────────────────────────
const isSuperAdmin = (user: any): boolean => Boolean(user?.superAdmin)
const isManager = (user: any): boolean => user?.level === 'manager'

const readAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user) || isManager(user)) return true
  return { id: { equals: user.id } }
}

const updateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  // Members may update their own profile/auth record, but role-bearing fields
  // below are separately protected at field level.
  return { id: { equals: user.id } }
}

const adminOnly: Access = ({ req: { user } }) => isSuperAdmin(user)
const adminOnlyField = ({ req: { user } }: any) => isSuperAdmin(user)

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'username', 'department', 'level', 'superAdmin'],
  },
  auth: {
    useAPIKey: true,
    loginWithUsername: {
      allowEmailLogin: true,
      requireEmail: false,
    },
  },
  access: {
    read: readAccess,
    create: adminOnly,
    update: updateAccess,
    delete: adminOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Display Name',
    },
    {
      name: 'department',
      type: 'select',
      required: true,
      label: 'Department',
      options: [
        { label: 'Sales', value: 'sales' },
        { label: 'Marketing', value: 'marketing' },
      ],
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        description: 'Controls application access. Only Super Admins may change this field.',
      },
    },
    {
      name: 'level',
      type: 'select',
      required: true,
      defaultValue: 'member',
      label: 'Level',
      options: [
        { label: 'Manager', value: 'manager' },
        { label: 'Member', value: 'member' },
      ],
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        description: 'Authorization level. Only Super Admins may change this field.',
      },
    },
    {
      name: 'regions',
      type: 'select',
      hasMany: true,
      label: 'Regions (Sales members only)',
      options: REGION_OPTIONS,
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
      admin: {
        description: 'Sales scope. Only Super Admins may change this field.',
        condition: (data) => data?.department === 'sales' && data?.level === 'member',
      },
    },
    {
      name: 'superAdmin',
      type: 'checkbox',
      defaultValue: false,
      label: 'Super Admin (sees both apps)',
      access: {
        create: adminOnlyField,
        update: adminOnlyField,
      },
    },
  ],
}

export default Users
