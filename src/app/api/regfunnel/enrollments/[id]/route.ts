import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

export const dynamic = 'force-dynamic'

const isInternal = (user: any) =>
  Boolean(user?.superAdmin) || user?.department === 'marketing'

const safeDate = (value: unknown) => value || null

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: req.headers })

  if (!isInternal(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let enrollment: any
  try {
    enrollment = await payload.findByID({
      collection: 'funnel-enrollment',
      id,
      overrideAccess: true,
    })
  } catch {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  }

  if (!enrollment) {
    return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })
  }

  const sendResult: any = await payload.find({
    collection: 'send-log',
    where: { externalId: { equals: enrollment.externalId } },
    sort: '-attemptedAt',
    limit: 250,
    overrideAccess: true,
  })

  const sends = sendResult.docs || []
  const notificationIds = [...new Set(
    sends
      .map((row: any) => row.notificationId)
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0),
  )]

  let eventDocs: any[] = []
  if (notificationIds.length) {
    const eventResult: any = await payload.find({
      collection: 'events',
      where: {
        or: notificationIds.map((notificationId) => ({ notificationId: { equals: notificationId } })),
      },
      sort: '-timestamp',
      limit: 500,
      overrideAccess: true,
    })
    eventDocs = eventResult.docs || []
  }

  const events = eventDocs.map((event: any) => ({
    id: event.id,
    notificationId: event.notificationId || null,
    eventType: event.eventType,
    timestamp: safeDate(event.timestamp),
    source: event.source || null,
    channel: event.channel || null,
    templateKey: event.templateKey || null,
  }))

  const counts = events.reduce(
    (acc: Record<string, number>, event: any) => {
      const key = String(event.eventType || '')
      if (key) acc[key] = (acc[key] || 0) + 1
      return acc
    },
    {},
  )

  return NextResponse.json({
    enrollment: {
      id: enrollment.id,
      externalId: enrollment.externalId,
      country: enrollment.country || null,
      culture: enrollment.culture || null,
      language: enrollment.language || null,
      funnelRegion: enrollment.funnelRegion,
      osApp: enrollment.osApp,
      variant: enrollment.variant,
      state: enrollment.state,
      currentStep: enrollment.currentStep || null,
      lastSentStep: enrollment.lastSentStep || null,
      sendIndex: enrollment.sendIndex ?? 0,
      enrolledAt: safeDate(enrollment.enrolledAt),
      nextSendAt: safeDate(enrollment.nextSendAt),
      convertedAt: safeDate(enrollment.convertedAt),
      convertedAtStep: enrollment.convertedAtStep || null,
      completedAt: safeDate(enrollment.completedAt),
      paused: Boolean(enrollment.paused),
      excluded: Boolean(enrollment.excluded),
      updatedAt: safeDate(enrollment.updatedAt),
    },
    sends: sends.map((send: any) => ({
      id: send.id,
      stepId: send.stepId,
      variant: send.variant || null,
      osApp: send.osApp || null,
      templateId: send.templateId || null,
      notificationId: send.notificationId || null,
      attemptedAt: safeDate(send.attemptedAt),
      result: send.result,
      errorDetail: send.result === 'error' ? send.errorDetail || null : null,
    })),
    events,
    engagement: {
      delivered: counts.delivered || 0,
      opened: counts.opened || 0,
      clicked: counts.clicked || 0,
      unsubscribed: counts.unsubscribed || 0,
      bounced: (counts.bounced_hard || 0) + (counts.bounced_soft || 0),
      complained: counts.complained || 0,
      failed: counts.failed || 0,
    },
  })
}
