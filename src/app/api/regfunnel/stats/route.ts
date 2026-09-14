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

const sequenceOf = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item: any) => String(item?.stepId || '').trim())
        .filter(Boolean)
    : []

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
  const funnelConfig: any = await payload.findGlobal({ slug: 'funnel-config' })

  // The selected date range is an ENROLLMENT COHORT. Every funnel metric below
  // uses that same cohort so A/B conversion and engagement share one denominator.
  // Send/event activity is therefore attributed to users enrolled in the period,
  // rather than independently filtering sends by attempted_at.

  // 1) Funnel state distribution (per region × app × variant × state)
  const states = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant, state, COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, state
  `))

  // 2) Where converted users exited (converted_at_step)
  const convertedByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant,
           COALESCE(converted_at_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'converted'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, step_id
  `))

  // 3) Where in-progress users currently are (current_step)
  const currentByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant,
           COALESCE(current_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'in_progress'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, step_id
  `))

  // 4) Engagement for the SAME enrollment cohort.
  //    notification_id is the bridge between SendLog and Events.
  //    os_app remains a reporting dimension so China and Global health can be
  //    inspected independently inside CNJP (Japan=global, China=china).
  //
  //    NOTE: send_log.os_app and funnel_enrollment.os_app are separate Postgres
  //    enum types. Cast them to text before COALESCE or Postgres will throw a
  //    runtime type error even though both enums contain "global"/"china".
  const engagement = rowsOf(await db.execute(sql`
    WITH cohort AS (
      SELECT external_id, funnel_region, os_app
      FROM funnel_enrollment
      WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    ),
    s AS (
      SELECT sl.step_id,
             sl.variant,
             COALESCE(sl.os_app::text, c.os_app::text) AS os_app,
             sl.notification_id,
             sl.result,
             c.funnel_region
      FROM send_log sl
      INNER JOIN cohort c ON c.external_id = sl.external_id
    )
    SELECT
      s.funnel_region, s.os_app, s.variant, s.step_id,
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
    GROUP BY s.funnel_region, s.os_app, s.variant, s.step_id
    ORDER BY s.funnel_region, s.os_app, s.variant, s.step_id
  `))

  return NextResponse.json({
    days,
    generatedAt: new Date().toISOString(),
    cohortBasis: 'enrolledAt',
    sequences: {
      ROW: sequenceOf(funnelConfig?.sequenceRow),
      CNJP: sequenceOf(funnelConfig?.sequenceCnjp),
    },
    states,
    convertedByStep,
    currentByStep,
    engagement,
  })
}
