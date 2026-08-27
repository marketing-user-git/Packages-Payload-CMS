import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

// Must satisfy the Users collection's required fields (name/username/department/
// level) — it gained those in the auth rewrite, and payload.create is typed against
// them. superAdmin so admin e2e tests can reach both apps.
export const testUser = {
  name: 'Dev Test User',
  username: 'dev.test',
  email: 'dev@payloadcms.com',
  password: 'test',
  department: 'sales' as const,
  level: 'manager' as const,
  superAdmin: true,
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      username: {
        equals: testUser.username,
      },
    },
  })

  // Create fresh test user
  await payload.create({
    collection: 'users',
    data: testUser,
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      username: {
        equals: testUser.username,
      },
    },
  })
}
