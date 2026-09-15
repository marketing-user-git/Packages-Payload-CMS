// src/app/api/regfunnel/stats/route.ts
// RegFunnelOps — aggregated funnel + A/B engagement stats for the operational dashboard.
// Heavy joins stay in Postgres so the browser receives dashboard-ready data only.

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

  const { user } = await payload.auth({ headers: req.headers })
  if (!isInternal(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysRaw = Number(req.nextUrl.searchParams.get('days') ?? 90)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 3650) : 90

  const db: any = payload.db.drizzle
  const funnelConfig: any = await payload.findGlobal({ slug: 'funnel-config' })

  const states = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant, state, COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, state
  `))

  const previousStates = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant, state, COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE enrolled_at < NOW() - make_interval(days => ${days})
      AND enrolled_at >= NOW() - make_interval(days => ${days * 2})
    GROUP BY funnel_region, os_app, variant, state
  `))

  const abStats = rowsOf(await db.execute(sql`
    SELECT
      funnel_region,
      os_app,
      variant,
      COUNT(*)::int AS enrolled,
      COUNT(*) FILTER (WHERE state = 'converted')::int AS converted,
      COUNT(*) FILTER (WHERE state = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE state = 'excluded')::int AS excluded,
      AVG(EXTRACT(EPOCH FROM (converted_at - enrolled_at)) / 3600.0)
        FILTER (WHERE state = 'converted' AND converted_at IS NOT NULL)::float AS avg_hours_to_convert
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant
  `))

  const convertedByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant,
           COALESCE(converted_at_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'converted'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, step_id
  `))

  const currentByStep = rowsOf(await db.execute(sql`
    SELECT funnel_region, os_app, variant,
           COALESCE(current_step, '00_no_email_yet') AS step_id,
           COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE state = 'in_progress'
      AND enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant, step_id
  `))

  const funnelStages = rowsOf(await db.execute(sql`
    SELECT
      funnel_region,
      os_app,
      variant,
      COUNT(*)::int AS enrolled,
      COUNT(*) FILTER (WHERE send_index >= 1)::int AS started,
      COUNT(*) FILTER (
        WHERE send_index >= CASE WHEN funnel_region = 'ROW' THEN 5 ELSE 3 END
      )::int AS mid_journey,
      COUNT(*) FILTER (
        WHERE send_index >= CASE WHEN funnel_region = 'ROW' THEN 10 ELSE 7 END
      )::int AS late_journey,
      COUNT(*) FILTER (WHERE state = 'converted')::int AS converted,
      COUNT(*) FILTER (WHERE state = 'completed')::int AS completed
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY funnel_region, os_app, variant
  `))

  const trend = rowsOf(await db.execute(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('day', enrolled_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS enrolled,
      COUNT(*) FILTER (WHERE state = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE state = 'converted')::int AS converted,
      COUNT(*) FILTER (WHERE state = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE state = 'excluded')::int AS excluded
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY DATE_TRUNC('day', enrolled_at)
    ORDER BY DATE_TRUNC('day', enrolled_at)
  `))

  const countryPerformance = rowsOf(await db.execute(sql`
    SELECT
      COALESCE(NULLIF(country, ''), 'Unknown') AS country,
      funnel_region,
      os_app,
      variant,
      state,
      COUNT(*)::int AS n
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    GROUP BY country, funnel_region, os_app, variant, state
  `))

  const recentEnrollments = rowsOf(await db.execute(sql`
    SELECT
      id,
      external_id,
      country,
      culture,
      funnel_region,
      os_app,
      variant,
      state,
      current_step,
      last_sent_step,
      send_index,
      next_send_at,
      enrolled_at,
      converted_at,
      completed_at,
      paused,
      excluded
    FROM funnel_enrollment
    WHERE enrolled_at >= NOW() - make_interval(days => ${days})
    ORDER BY enrolled_at DESC
    LIMIT 50
  `))

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
    previousStates,
    abStats,
    convertedByStep,
    currentByStep,
    funnelStages,
    trend,
    countryPerformance,
    recentEnrollments,
    engagement,
  })
}
