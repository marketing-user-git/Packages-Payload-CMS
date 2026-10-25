import configPromise from '@payload-config'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayload } from 'payload'
import { randomUUID, timingSafeEqual } from 'node:crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Private service endpoint. Set REGFUNNEL_SENDER_TOKEN (32+ random chars) on Payload
// and use x-regfunnel-token in a dedicated n8n credential. Never expose in browser.
type Tx = { execute(query: unknown): Promise<{ rows: any[] }> }
type Result = Record<string, unknown>
const rows = async (tx: Tx, q: unknown): Promise<any[]> => (await tx.execute(q)).rows
const first = async (tx: Tx, q: unknown): Promise<any> => (await rows(tx, q))[0]
const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const minutesOld = (v: unknown) => (Date.now() - new Date(String(v)).getTime()) / 60000

function auth(request: Request): boolean {
  const secret = process.env.REGFUNNEL_SENDER_TOKEN
  const value = request.headers.get('x-regfunnel-token')
  if (!secret || secret.length < 32 || !value) return false
  const a = Buffer.from(value), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
function schedule(u: any, cfg: any, index: number, length: number): string | null {
  if (index >= length) return null
  const days = Number(cfg.interval_days) > 0 ? Number(cfg.interval_days) : 2
  const base = new Date(u.enrolled_at).getTime()
  if (!Number.isFinite(base)) throw new Error('Invalid enrolledAt')
  const interval = days * 86400000, due = base + interval * index
  return new Date(due <= Date.now() ? Date.now() + interval : due).toISOString()
}
async function steps(tx: Tx, u: any, cfg: any): Promise<string[]> {
  const q = u.funnel_region === 'CNJP'
    ? sql`SELECT step_id FROM funnel_config_sequence_cnjp WHERE _parent_id = ${cfg.id} ORDER BY _order`
    : sql`SELECT step_id FROM funnel_config_sequence_row WHERE _parent_id = ${cfg.id} ORDER BY _order`
  return (await rows(tx, q)).map(x => String(x.step_id))
}
async function progress(tx: Tx, u: any, cfg: any, length: number, step: string) {
  const expected = Number(u.send_index), next = expected + 1
  const completed = next >= length, nextSendAt = schedule(u, cfg, next, length)
  const result = await rows(tx, sql`
    UPDATE funnel_enrollment
    SET send_index = ${next}, current_step = ${step}, last_sent_step = ${step},
        next_send_at = ${nextSendAt}::timestamptz,
        state = CASE WHEN ${completed} THEN 'completed'::enum_funnel_enrollment_state ELSE state END,
        completed_at = CASE WHEN ${completed} THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE id = ${u.id} AND send_index = ${expected} AND state = 'in_progress'
      AND COALESCE(paused, false) = false AND COALESCE(excluded, false) = false
    RETURNING id
  `)
  return { advanced: result.length === 1, completed, nextSendAt }
}

async function claim(tx: Tx, b: any): Promise<Result> {
  if (!integer(b.enrollmentId) || b.enrollmentId === 0 || !integer(b.expectedSendIndex)) return { action:'invalid' }
  const u = await first(tx, sql`SELECT * FROM funnel_enrollment WHERE id = ${b.enrollmentId} FOR UPDATE`)
  if (!u) return { action:'not_found' }
  if (u.state !== 'in_progress' || u.paused || u.excluded) return { action:'ineligible' }
  if (Number(u.send_index) !== b.expectedSendIndex) return { action:'stale_enrollment' }
  if (!u.next_send_at || new Date(u.next_send_at).getTime() > Date.now()) return { action:'not_due' }
  const cfg = await first(tx, sql`SELECT * FROM funnel_config ORDER BY id LIMIT 1`)
  if (!cfg) return { action:'missing_config' }
  const seq = await steps(tx, u, cfg), step = seq[b.expectedSendIndex]
  if (!step) return { action:'sequence_complete' }

  // Bridge for all pre-cutover successful sends; no new email after an existing sent row.
  const oldSent = await first(tx, sql`SELECT notification_id FROM send_log
    WHERE external_id = ${u.external_id} AND step_id = ${step} AND result = 'sent'
    LIMIT 1`)
  if (oldSent) {
    const p = await progress(tx, u, cfg, seq.length, step)
    return { action:'already_sent', notificationId:oldSent.notification_id, ...p }
  }
  // Ambiguous legacy errors should not be resent without a provider reconciliation.
  const oldError = await first(tx, sql`SELECT id FROM send_log
    WHERE external_id = ${u.external_id} AND step_id = ${step} AND result = 'error' LIMIT 1`)
  if (oldError) {
    await tx.execute(sql`UPDATE funnel_enrollment SET paused=true, next_send_at=NULL, updated_at=now()
      WHERE id=${u.id} AND send_index=${b.expectedSendIndex}`)
    return { action:'needs_review', reason:'legacy_error', externalId:u.external_id, stepId:step }
  }
  const tmpl = await first(tx, sql`SELECT global, china FROM funnel_config_templates
    WHERE _parent_id=${cfg.id} AND step_id=${step} AND variant=${u.variant} LIMIT 1`)
  const template = u.os_app === 'china' ? tmpl?.china : tmpl?.global
  const app = u.os_app === 'china' ? cfg.one_signal_apps_china_app_id : cfg.one_signal_apps_global_app_id
  if (!template || !app) return { action:'no_template', stepId:step }

  let c = await first(tx, sql`INSERT INTO regfunnel_dispatch_claim
    (enrollment_id,external_id,step_id,send_index,variant,os_app,template_id,app_id,status,claim_token,idempotency_key)
    VALUES (${u.id},${u.external_id},${step},${b.expectedSendIndex},${u.variant},${u.os_app},
            ${template},${app},'claimed',${randomUUID()}::uuid,${randomUUID()}::uuid)
    ON CONFLICT (enrollment_id,step_id) DO NOTHING RETURNING *`)
  if (!c) {
    c = await first(tx, sql`SELECT * FROM regfunnel_dispatch_claim
      WHERE enrollment_id=${u.id} AND step_id=${step} FOR UPDATE`)
    if (!c) throw new Error('Missing claim after conflict')
    if (c.status === 'sent') {
      const p = await progress(tx,u,cfg,seq.length,step)
      return { action:'already_sent', ...p }
    }
    if (c.status === 'needs_review') return { action:'needs_review', claimId:c.id }
    if (c.status === 'dispatching') {
      if (minutesOld(c.dispatch_started_at) < 3) return { action:'busy', claimId:c.id }
      await tx.execute(sql`UPDATE regfunnel_dispatch_claim SET status='needs_review',updated_at=now()
        WHERE id=${c.id} AND status='dispatching'`)
      await tx.execute(sql`UPDATE funnel_enrollment SET paused=true,next_send_at=NULL,updated_at=now()
        WHERE id=${u.id} AND send_index=${b.expectedSendIndex}`)
      return { action:'needs_review',reason:'dispatch_outcome_unknown',claimId:c.id }
    }
    if (c.status === 'claimed' && minutesOld(c.claimed_at) < 5) return { action:'busy',claimId:c.id }
    if (!['claimed','retryable_no_recipient'].includes(c.status)) return { action:'needs_review',claimId:c.id }
    const key = c.status === 'retryable_no_recipient' ? randomUUID() : c.idempotency_key
    c = await first(tx, sql`UPDATE regfunnel_dispatch_claim
      SET claim_token=${randomUUID()}::uuid,idempotency_key=${key}::uuid,
          status='claimed',claimed_at=now(),dispatch_started_at=NULL,updated_at=now()
      WHERE id=${c.id} RETURNING *`)
  }
  return { action:'claimed',claimId:c.id,claimToken:c.claim_token,
    idempotencyKey:c.idempotency_key,externalId:u.external_id,stepId:step,
    variant:c.variant,osApp:c.os_app,templateId:c.template_id,appId:c.app_id }
}

async function begin(tx: Tx,b:any):Promise<Result> {
  if (!integer(b.claimId) || typeof b.claimToken !== 'string') return { action:'invalid' }
  const c = await first(tx, sql`UPDATE regfunnel_dispatch_claim
    SET status='dispatching',dispatch_started_at=now(),updated_at=now()
    WHERE id=${b.claimId} AND claim_token=${b.claimToken}::uuid AND status='claimed'
    RETURNING *`)
  if (!c) return { action:'fenced' }
  await tx.execute(sql`INSERT INTO regfunnel_dispatch_attempt
    (claim_id,claim_token,idempotency_key,result)
    VALUES (${c.id},${c.claim_token}::uuid,${c.idempotency_key}::uuid,'dispatching')`)
  return { action:'send',claimId:c.id,claimToken:c.claim_token,
    idempotencyKey:c.idempotency_key,externalId:c.external_id,stepId:c.step_id,
    variant:c.variant,osApp:c.os_app,templateId:c.template_id,appId:c.app_id }
}

async function finalize(tx: Tx,b:any):Promise<Result> {
  if (!integer(b.claimId) || typeof b.claimToken !== 'string') return { action:'invalid' }
  const identity = await first(tx, sql`SELECT enrollment_id FROM regfunnel_dispatch_claim WHERE id=${b.claimId}`)
  if (!identity) return { action:'not_found' }
  // Same lock order as claim: enrollment followed by claim.
  const u = await first(tx, sql`SELECT * FROM funnel_enrollment
    WHERE id=${identity.enrollment_id} FOR UPDATE`)
  const c = await first(tx, sql`SELECT * FROM regfunnel_dispatch_claim WHERE id=${b.claimId} FOR UPDATE`)
  if (!c || !u || c.claim_token !== b.claimToken) return { action:'fenced' }
  if (c.status === 'sent') return { action:'already_finalized',completed:u.state==='completed' }
  if (c.status !== 'dispatching') return { action:'fenced' }
  const notificationId = typeof b.notificationId === 'string' ? b.notificationId.slice(0,128) : ''
  const result = b.result === 'sent' && notificationId ? 'sent'
    : b.result === 'skipped_no_recipient' ? 'skipped_no_recipient' : 'error'
  const detail = result === 'sent' ? null : String(b.errorDetail || 'unknown_send_outcome').slice(0,800)
  const state = result === 'sent' ? 'sent'
    : result === 'skipped_no_recipient' ? 'retryable_no_recipient' : 'needs_review'
  await tx.execute(sql`INSERT INTO regfunnel_dispatch_attempt
    (claim_id,claim_token,idempotency_key,result,notification_id,error_detail)
    VALUES (${c.id},${c.claim_token}::uuid,${c.idempotency_key}::uuid,${result},${notificationId || null},${detail})`)

  const old = await first(tx, sql`SELECT id,result FROM send_log
    WHERE external_id=${c.external_id} AND step_id=${c.step_id}
    ORDER BY CASE WHEN result='sent' THEN 0 ELSE 1 END,id DESC LIMIT 1 FOR UPDATE`)
  if (old?.result === 'sent' && result !== 'sent') {
    throw new Error('Legacy sent row conflicts with outcome')
  }
  if (old) {
    await tx.execute(sql`UPDATE send_log SET result=${result}::enum_send_log_result,
      notification_id=${notificationId || null},attempted_at=now(),
      error_detail=${detail},updated_at=now()
      WHERE id=${old.id}`)
  } else {
    await tx.execute(sql`INSERT INTO send_log
      (external_id,step_id,variant,os_app,template_id,notification_id,attempted_at,result,error_detail)
      VALUES (${c.external_id},${c.step_id},${c.variant}::enum_send_log_variant,
        ${c.os_app}::enum_send_log_os_app,${c.template_id},${notificationId || null},
        now(),${result}::enum_send_log_result,${detail})`)
  }
  await tx.execute(sql`UPDATE regfunnel_dispatch_claim
    SET status=${state},notification_id=${notificationId || null},completed_at=now(),updated_at=now()
    WHERE id=${c.id} AND claim_token=${b.claimToken}::uuid`)
  if (result === 'sent') {
    const cfg=await first(tx,sql`SELECT * FROM funnel_config ORDER BY id LIMIT 1`)
    if (!cfg) throw new Error('Missing funnel config')
    const seq=await steps(tx,u,cfg)
    const p=Number(u.send_index) === Number(c.send_index)
      ? await progress(tx,u,cfg,seq.length,c.step_id)
      : { advanced:false,completed:u.state==='completed',nextSendAt:null }
    return { action:'finalized_sent',notificationId,...p }
  }
  if (result === 'skipped_no_recipient') {
    await tx.execute(sql`UPDATE funnel_enrollment
      SET next_send_at=now()+interval '1 hour',updated_at=now()
      WHERE id=${u.id} AND send_index=${c.send_index} AND state='in_progress'`)
    return { action:'retry_deferred' }
  }
  await tx.execute(sql`UPDATE funnel_enrollment
    SET paused=true,next_send_at=NULL,updated_at=now()
    WHERE id=${u.id} AND send_index=${c.send_index} AND state='in_progress'`)
  return { action:'needs_review',reason:'unknown_send_outcome',claimId:c.id }
}

export async function POST(request:Request):Promise<Response> {
  if (!process.env.REGFUNNEL_SENDER_TOKEN || process.env.REGFUNNEL_SENDER_TOKEN.length < 32) {
    return Response.json({ error:'Token not configured' },{status:503})
  }
  if (!auth(request)) return Response.json({ error:'Unauthorized' },{status:401})
  let body:any
  try { body=await request.json() }
  catch { return Response.json({error:'Invalid JSON'},{status:400}) }
  if (!body || !['claim','begin','finalize'].includes(body.action)) {
    return Response.json({error:'Unsupported action'},{status:400})
  }
  try {
    const payload=await getPayload({config:configPromise})
    const db=payload.db.drizzle as unknown as {transaction(fn:(tx:Tx)=>Promise<Result>):Promise<Result>}
    const answer=await db.transaction((tx)=>body.action==='claim' ? claim(tx,body)
      : body.action==='begin' ? begin(tx,body) : finalize(tx,body))
    return Response.json(answer,{headers:{'Cache-Control':'no-store'}})
  } catch(error) {
    console.error('RegFunnel atomic dispatch failed:',error)
    return Response.json({action:'backend_error'},{status:500})
  }
}
