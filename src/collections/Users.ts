import type { Access, CollectionConfig } from 'payload'

// Region options — kept in sync with Clients.ts
const REGION_OPTIONS = ['Brazil', 'South Africa', 'INT', 'MENA', 'LATAM', 'ROW']

// ── Access helpers ────────────────────────────────────────────────────────────
// A super-admin (that's you) can do anything. Managers can read the roster.
// Everyone else can only read/update their own record.
const isSuperAdmin = (user: any): boolean => Boolean(user?.superAdmin)
const isManager = (user: any): boolean => user?.level === 'manager'

const readAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user) || isManager(user)) return true
  // Regular members: only their own record
  return { id: { equals: user.id } }
}

const updateAccess: Access = ({ req: { user } }) => {
  if (!user) return false
  if (isSuperAdmin(user)) return true
  // Members can update their own record (e.g. change password) but not others
  return { id: { equals: user.id } }
}

// Only the super-admin creates or removes accounts.
const adminOnly: Access = ({ req: { user } }) => isSuperAdmin(user)

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'username', 'department', 'level', 'superAdmin'],
  },
  auth: {
    useAPIKey: true, // keep: the dashboard reads data via an API key
    // Let people log in with their username (natalia.a) like before,
    // while still allowing email login and keeping email optional.
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
      admin: {
        description: 'Determines which app the user sees. Sales → Packages, Marketing → Analytics.',
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
      admin: {
        description: 'Manager sees everything in their app. Member is scoped (sales members are region-limited).',
      },
    },
    {
      name: 'regions',
      type: 'select',
      hasMany: true,
      label: 'Regions (Sales members only)',
      options: REGION_OPTIONS,
      admin: {
        description: 'Only used for sales members. Leave empty for managers, marketing, and super-admins.',
        condition: (data) => data?.department === 'sales' && data?.level === 'member',
      },
    },
    {
      name: 'superAdmin',
      type: 'checkbox',
      defaultValue: false,
      label: 'Super Admin (sees both apps)',
      access: {
        // Only a super-admin can grant super-admin. Prevents privilege escalation.
        update: ({ req: { user } }) => isSuperAdmin(user),
        create: ({ req: { user } }) => isSuperAdmin(user),
      },
    },
  ],
}

export default Users