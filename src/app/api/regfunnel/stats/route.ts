// src/app/api/regfunnel/stats/route.ts
// RegFunnelOps — aggregated funnel + A/B engagement stats for the Journeys tab.
// Does the Events ⋈ SendLog ⋈ FunnelEnrollment join IN THE DATABASE so the
// browser never has to pull raw events. Internal-only (superAdmin or marketing).

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import configPromise from '@payload-config'

export const dynamic = 'force-dynamic'

const isInternal = (user: any) =>
  Boolean(user?.superAdmin) || user?.department === 'marketing'

const rowsOf = (res: any) => (Array.isArray(res) ? res : res?.rows ?? [])

export async function GET(req: NextRequest) {
  const payload = await getPayload({ config: configPromise })

  // Auth: same gate as the analytics view.
  const { user } = await payload.auth({ headers: req.headers })
  if (!isInternal(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysRaw = Number(req.nextUrl.searchParams.get('days') ?? 90)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 3650) : 90

  const db: any = payload.db.drizzle

  // 1) Funnel state distribution (per region × variant × state)
  const states = rowsOf(await db.execute(sql`
    SELECT funnel_region, variant, state, COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, variant, state
  `))

  // 2) Where converted users exited (converted_at_step)
  const convertedByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, variant,
           COALESCE(converted_at_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'converted'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, variant, step_id
  `))

  // 3) Where in-progress users currently are (current_step)
  const currentByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, variant,
           COALESCE(current_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'in_progress'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, variant, step_id
  `))

  // 4) Engagement per region × variant × step — THE bridge on notification_id.
  //    Region comes from FunnelEnrollment (send_log has no region).
  //    DISTINCT notification_id per event type = one count per send.
  const engagement = rowsOf(await db.execute(sql`
    WITH s AS (
      SELECT sl.step_id, sl.variant, sl.os_app, sl.notification_id, sl.result,
             fe.funnel_region
      FROM send_log sl
      LEFT JOIN funnel_enrollment fe ON fe.external_id = sl.external_id
      WHERE sl.attempted_at >= NOW() - make_interval(days => ${days})
    )
    SELECT
      s.funnel_region, s.variant, s.step_id,
      COUNT(*) FILTER (WHERE s.result = 'sent')::int                       AS sent,
      COUNT(*) FILTER (WHERE s.result = 'skipped_no_recipient')::int       AS no_recipient,
      COUNT(*) FILTER (WHERE s.result = 'error')::int                      AS errors,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type = 'delivered')::int    AS delivered,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type = 'opened')::int       AS opened,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type = 'clicked')::int      AS clicked,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type = 'unsubscribed')::int AS unsubscribed,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type IN ('bounced_hard','bounced_soft'))::int AS bounced,
      COUNT(DISTINCT e.notification_id) FILTER (WHERE e.event_type = 'complained')::int   AS complained
    FROM s
    LEFT JOIN events e ON e.notification_id = s.notification_id
    GROUP BY s.funnel_region, s.variant, s.step_id
    ORDER BY s.funnel_region, s.variant, s.step_id
  `))

  return NextResponse.json({
    days,
    generatedAt: new Date().toISOString(),
    states,
    convertedByStep,
    currentByStep,
    engagement,
  })
}