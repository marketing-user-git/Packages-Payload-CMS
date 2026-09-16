# RegFunnelOps — Mailgun Webhooks

RegFunnelOps uses Mailgun as the source of truth for email delivery and engagement events because Mailgun is the actual email delivery provider. `SendLog` remains the source of truth for whether RegFunnelOps sent an email.

The endpoint is:

`POST /api/webhooks/mailgun`

Production target:

`https://pkg.easy-markets.com/api/webhooks/mailgun`

## Environment

Required:

```env
MAILGUN_SIGNING_KEY=********
```

Optional replay-window override:

```env
MAILGUN_WEBHOOK_MAX_AGE_SECONDS=86400
```

The default maximum signature age is 24 hours. It is deliberately lenient so provider delays/retries are not rejected aggressively.

No Mailgun API key is required for real-time webhook ingestion.

## Localhost support

Mailgun cannot call `http://localhost:3000` directly because localhost is not public. The application itself works locally without a special code path; expose the local Next.js server through a public HTTPS tunnel.

Run the app:

```bash
pnpm dev
```

Check:

```text
http://localhost:3000/api/webhooks/mailgun
```

Expected:

```json
{
  "ok": true,
  "route": "mailgun webhook",
  "signingKeyConfigured": true
}
```

Then expose port 3000:

```bash
cloudflared tunnel --url http://localhost:3000
```

Use the returned HTTPS hostname plus:

```text
/api/webhooks/mailgun
```

Quick-tunnel URLs change when restarted. Production must use the permanent `pkg.easy-markets.com` endpoint.

Mailgun can have multiple URLs for an event type, so production and a temporary development tunnel can coexist while testing.

## Configure in Mailgun

Use a domain-level webhook on the actual sending domain used by the OneSignal marketing flow.

Configure:

- Delivered
- Opened
- Clicked
- Unsubscribed
- Complained
- Permanent Fail
- Temporary Fail

Do **not** configure `Accepted` for RegFunnelOps. `SendLog` is the canonical sent signal, so ingesting Mailgun Accepted would introduce a second meaning for the same stage.

`Delivered` powers delivery rate. Open/click metrics require Mailgun tracking to be enabled on the sending domain.

During local development:

```text
Production: https://pkg.easy-markets.com/api/webhooks/mailgun
Local:      https://<current-local-tunnel>.trycloudflare.com/api/webhooks/mailgun
```

Remove the temporary local URL when the tunnel expires or testing ends.

## RegFunnel-only filtering

`ms.easy-markets.com` carries traffic unrelated to RegFunnelOps. The receiver therefore does not persist all domain events.

An event enters RegFunnelOps only when:

1. `event-data.user-variables.notification_id` exists.
2. The value matches `SendLog.notificationId` on a row whose result is `sent`.

Everything else is acknowledged with HTTP 200 and `ignored: true` without creating an Event.

Typical synthetic Mailgun Test result:

```json
{
  "ok": true,
  "ignored": true,
  "reason": "missing_notification_id",
  "eventType": "delivered"
}
```

A fresh real RegFunnel send is required for end-to-end validation.

## Identity bridge

The OneSignal-generated Mailgun event contains RegFunnel variables such as:

- `notification_id`
- `app_id`
- optional `region`

The join is:

```text
FunnelEnrollment
  -> SendLog.externalId
  -> SendLog.notificationId
  -> Mailgun user-variables.notification_id
  -> Events.notificationId
  -> RegFunnelOps Send Health / user timeline
```

## Security and idempotency

Mailgun signs every webhook. The receiver verifies HMAC SHA-256 with `MAILGUN_SIGNING_KEY`; parent signatures are also supported for account/subaccount setups.

After HMAC verification, the signature timestamp must fall within the configured replay window. The default is 24 hours.

For real provider events, Mailgun's event `id` is stored as `Events.providerEventId`. That field has a database unique index. This means an exact webhook retry/replay cannot create a second raw event or increment the analytics rollup twice, including if two identical requests race concurrently.

Do not add a localhost/development bypass for signature verification. Local tunnel traffic follows the same checks as production.

## Validation

1. Run Payload/Next with `MAILGUN_SIGNING_KEY` present.
2. Confirm the GET health endpoint returns `signingKeyConfigured: true`.
3. Expose localhost through Cloudflare when testing locally.
4. Mailgun Test should return HTTP 200; `missing_notification_id` is expected for its synthetic payload.
5. Send a fresh email through the normal RegFunnel Sender.
6. Confirm `SendLog.notificationId` is populated.
7. Wait for `delivered`.
8. Confirm Events contains the same `notificationId`, `eventType=delivered`, and a provider event ID.
9. Open and click the message and verify `opened` and `clicked` events.
10. Refresh RegFunnelOps and confirm delivery tracking is available.
11. Open `/regfunnel/enrollment/{id}` and confirm the timeline contains the events.
12. If testing retries, replaying the same provider event ID must not create another Events row or increase rollups.

## Existing test data

Webhook tracking is real-time. Sends that happened before the webhook was configured are not backfilled automatically.
