# RegFunnelOps — Mailgun Webhooks

RegFunnelOps uses Mailgun as the source of truth for email delivery and engagement events because Mailgun is the actual email delivery provider.

The existing endpoint is:

`POST /api/webhooks/mailgun`

Production target:

`https://pkg.easy-markets.com/api/webhooks/mailgun`

During local testing, use the active public tunnel domain with the same path. Mailgun cannot POST directly to localhost.

## Required environment variable

```env
MAILGUN_SIGNING_KEY=********
```

No Mailgun API key is required for real-time webhook ingestion.

## Configure in Mailgun

Configure the webhook URL for the email events used by RegFunnelOps:

- Accepted
- Delivered
- Opened
- Clicked
- Unsubscribed
- Complained
- Permanent Fail
- Temporary Fail

`Delivered` is the event used by the dashboard for delivery rate.

Opened/clicked metrics require the corresponding Mailgun tracking settings to be enabled for the sending domain.

## Identity bridge

The OneSignal-generated Mailgun event payload already includes custom `user-variables` for the RegFunnel send. RegFunnelOps expects:

- `notification_id`
- `app_id`
- optional `region`

The webhook reads:

```text
event-data.user-variables.notification_id
event-data.user-variables.app_id
```

`notification_id` is the bridge back to `SendLog.notificationId`.

This gives the chain:

```text
FunnelEnrollment
  -> SendLog.externalId
  -> SendLog.notificationId
  -> Mailgun event user-variables.notification_id
  -> Events.notificationId
  -> RegFunnelOps Send Health / user timeline
```

## Security

Mailgun signs every webhook request. `/api/webhooks/mailgun` verifies the signature with `MAILGUN_SIGNING_KEY` before accepting the event.

## Validation

After configuring the webhook:

1. Send a fresh RegFunnelOps test email through the normal Sender workflow.
2. Confirm `SendLog` contains a non-empty `notificationId` for the send.
3. Wait for Mailgun to emit `delivered`.
4. Confirm a row is created in `events` with the same `notificationId` and `eventType=delivered`.
5. Refresh RegFunnelOps.
6. Confirm Send Health shows delivered data and the delivery-tracking warning disappears.
7. Open `/regfunnel/enrollment/{id}` and confirm the delivery/open/click events appear in the activity timeline.

## Existing test data

Webhook tracking is real-time. Old test sends that happened before the webhook was configured will not automatically gain delivery events. Validate the integration with a fresh send.
