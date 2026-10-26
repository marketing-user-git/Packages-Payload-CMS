import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({ getPayload: vi.fn() }))
vi.mock('payload', () => ({ getPayload: mocked.getPayload }))
vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))

import { POST } from '@/app/api/regfunnel/dispatch/route'

const token = 'integration-test-secret-key-with-at-least-32-characters'
const claimToken = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const idempotencyKey = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type DbRow = Record<string, unknown>

function dbResponses(...values: DbRow[][]) {
  let next = 0
  const execute = vi.fn(async () => ({ rows: values[next++] ?? [] }))
  mocked.getPayload.mockResolvedValue({
    db: { drizzle: { transaction: (fn: (tx: { execute: typeof execute }) => Promise<unknown>) => fn({ execute }) } },
  })
  return execute
}

async function request(action: Record<string, unknown>, providedToken = token) {
  return POST(new Request('https://local.test/api/regfunnel/dispatch', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-regfunnel-token': providedToken },
    body: JSON.stringify(action),
  }))
}

describe('RegFunnel atomic endpoint safety regression tests', () => {
  const previous = process.env.REGFUNNEL_SENDER_TOKEN
  beforeEach(() => {
    process.env.REGFUNNEL_SENDER_TOKEN = token
    mocked.getPayload.mockReset()
  })
  afterEach(() => {
    if (previous === undefined) delete process.env.REGFUNNEL_SENDER_TOKEN
    else process.env.REGFUNNEL_SENDER_TOKEN = previous
  })

  it('rejects requests without a valid service token before DB access', async () => {
    const response = await request({ action: 'claim', enrollmentId: 1, expectedSendIndex: 0 }, 'not-valid')
    expect(response.status).toBe(401)
    expect(mocked.getPayload).not.toHaveBeenCalled()
  })

  it('rejects invalid UUID tokens without attempting SQL', async () => {
    const execute = dbResponses()
    const response = await request({ action: 'begin', claimId: 5, claimToken: 'not-a-uuid' })
    expect((await response.json()).action).toBe('invalid')
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { state: 'converted', paused: false, excluded: false, send_index: 0 },
    { state: 'in_progress', paused: true, excluded: false, send_index: 0 },
    { state: 'in_progress', paused: false, excluded: true, send_index: 0 },
    { state: 'in_progress', paused: false, excluded: false, send_index: 1 },
  ])('fences begin if enrollment changed since claim: %o', async (enrollment) => {
    const execute = dbResponses(
      [{ enrollment_id: 42 }],
      [{ id: 42, ...enrollment }],
      [{ id: 9, claim_token: claimToken, status: 'claimed', send_index: 0 }],
    )
    const response = await request({ action: 'begin', claimId: 9, claimToken })
    expect(response.status).toBe(200)
    expect((await response.json()).action).toBe('fenced')
    // Only the identity lookup and two row locks. Never transition to dispatching.
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('begins exactly once when the claim and enrollment are eligible', async () => {
    const claim = {
      id: 9, enrollment_id: 42, claim_token: claimToken, status: 'claimed',
      send_index: 0, idempotency_key: idempotencyKey,
      external_id: 'test-person', step_id: '01_tv_account_types',
      variant: 'A', os_app: 'global', template_id: 'test-template', app_id: 'test-app',
    }
    const execute = dbResponses(
      [{ enrollment_id: 42 }],
      [{ id: 42, state: 'in_progress', paused: false, excluded: false, send_index: 0 }],
      [claim],
      [{ ...claim, status: 'dispatching' }],
      [],
    )
    const response = await request({ action: 'begin', claimId: 9, claimToken })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.action).toBe('send')
    expect(body.idempotencyKey).toBe(idempotencyKey)
    expect(execute).toHaveBeenCalledTimes(5)
  })

  it('does not modify a previously sent analytics log when a different provider ID arrives', async () => {
    const execute = dbResponses(
      [{ enrollment_id: 42 }],
      [{ id: 42, state: 'in_progress', paused: false, excluded: false, send_index: 0 }],
      [{ id: 9, claim_token: claimToken, status: 'dispatching', send_index: 0,
        external_id: 'test-person', step_id: '01_tv_account_types', idempotency_key: idempotencyKey }],
      [], // append-only dispatch attempt
      [{ id: 77, result: 'sent', notification_id: 'existing-notification' }],
      [], // quarantine claim
      [], // pause enrollment
    )
    const response = await request({
      action: 'finalize', claimId: 9, claimToken,
      result: 'sent', notificationId: 'different-notification',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      action: 'needs_review', reason: 'conflicting_sent_log',
    })
    expect(execute).toHaveBeenCalledTimes(7)
  })

  it('does not finalize a second time after a successful send', async () => {
    const execute = dbResponses(
      [{ enrollment_id: 42 }],
      [{ id: 42, state: 'completed' }],
      [{ id: 9, claim_token: claimToken, status: 'sent' }],
    )
    const response = await request({
      action: 'finalize', claimId: 9, claimToken,
      result: 'sent', notificationId: 'same-notification',
    })
    expect(await response.json()).toMatchObject({
      action: 'already_finalized', completed: true,
    })
    expect(execute).toHaveBeenCalledTimes(3)
  })
})
