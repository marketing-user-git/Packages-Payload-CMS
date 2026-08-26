/**
 * Seed / migrate users into the Payload `users` collection.
 *
 * Run with:  pnpm payload run scripts/seed-users.ts
 *
 * Idempotent: existing users (matched by username) are updated, not duplicated.
 * Passwords are hashed automatically by Payload on create.
 *
 * IMPORTANT: change the passwords below (and your super-admin username/password)
 * before running in production. Users can change their own password after first login.
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

type SeedUser = {
  name: string
  username: string
  password: string
  department: 'sales' | 'marketing'
  level: 'manager' | 'member'
  regions?: string[]
  superAdmin?: boolean
  email?: string
}

const USERS: SeedUser[] = [
  // ── Super admin (you) — sees BOTH apps ──────────────────────────────────────
  {
    name: 'Alexandros S.',
    username: 'alexandros', // ← change if you prefer
    password: 'ChangeMe_Now!2026', // ← CHANGE THIS before running
    department: 'marketing', // department is ignored for super-admins
    level: 'manager',
    superAdmin: true,
  },

  // ── Sales → Packages app ────────────────────────────────────────────────────
  {
    name: 'Manager',
    username: 'manager',
    password: 'Manager24!',
    department: 'sales',
    level: 'manager', // Head of Sales → all regions
  },
  {
    name: 'Natalia A.',
    username: 'natalia.a',
    password: 'Easy2024!',
    department: 'sales',
    level: 'member',
    regions: ['Brazil', 'LATAM'],
  },
  {
    name: 'Angela M.',
    username: 'angela.a',
    password: 'Easy2024!',
    department: 'sales',
    level: 'member',
    regions: ['South Africa', 'INT', 'MENA', 'ROW'],
  },

  // ── Marketing → Analytics app ───────────────────────────────────────────────
  {
    name: 'Eirineos',
    username: 'eirineos',
    password: 'Reports24!',
    department: 'marketing',
    level: 'member',
  },
  {
    name: 'Christiana',
    username: 'christiana',
    password: 'Reports24!',
    department: 'marketing',
    level: 'member',
  },
]

const run = async () => {
  const payload = await getPayload({ config })

  for (const u of USERS) {
    const existing = await payload.find({
      collection: 'users',
      where: { username: { equals: u.username } },
      limit: 1,
    })

    const data: Record<string, unknown> = {
      name: u.name,
      username: u.username,
      department: u.department,
      level: u.level,
      regions: u.regions ?? [],
      superAdmin: u.superAdmin ?? false,
    }
    if (u.email) data.email = u.email

    if (existing.docs.length > 0) {
      const id = existing.docs[0].id
      // Update profile fields (not the password, to avoid clobbering changes)
      await payload.update({ collection: 'users', id, data, overrideAccess: true })
      payload.logger.info(`Updated user: ${u.username}`)
    } else {
      await payload.create({
        collection: 'users',
        data: { ...data, password: u.password } as any,
        overrideAccess: true,
      })
      payload.logger.info(`Created user: ${u.username}`)
    }
  }

  payload.logger.info('✅ User seed complete.')
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
