# RegFunnelOps — Mailgun Webhooks

RegFunnelOps uses Mailgun as the source of truth for email delivery and engagement events because Mailgun is the actual email delivery provider.

The endpoint is:

`POST /api/webhooks/mailgun`

Production target:

`https://pkg.easy-markets.com/api/webhooks/mailgun`

## Required environment variable

```env
MAILGUN_SIGNING_KEY=********
```

No Mailgun API key is required for real-time webhook ingestion.

The same signing key is used locally and in production for the same Mailgun account/domain.

## Localhost support

Mailgun cannot call `http://localhost:3000` directly because localhost is not public. The application itself works locally without any special code path; expose the local Next.js server through a public HTTPS tunnel.

Run the app:

```bash
pnpm dev
```

Check the local webhook health endpoint:

```text
http://localhost:3000/api/webhooks/mailgun
```

Expected response:

```json
{
  "ok": true,
  "route": "mailgun webhook",
  "signingKeyConfigured": true
}
```

Then expose port 3000 with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will return a temporary HTTPS hostname, for example:

```text
https://example-random.trycloudflare.com
```

Use this Mailgun webhook URL for local testing:

```text
https://example-random.trycloudflare.com/api/webhooks/mailgun
```

A quick tunnel URL changes when the tunnel is restarted. For a permanent development endpoint, use a named Cloudflare Tunnel with a stable hostname.

Mailgun supports multiple webhook URLs per event type, so production and local development can be configured at the same time. Keep the production URL and add the active tunnel URL while testing locally.

## Configure in Mailgun

Use a domain-level webhook on the actual Mailgun sending domain used by the OneSignal marketing flow.

Configure the webhook URL(s) for:

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

Recommended configuration while developing:

```text
URL 1: https://pkg.easy-markets.com/api/webhooks/mailgun
URL 2: https://<current-local-tunnel>.trycloudflare.com/api/webhooks/mailgun
```

Remove or replace URL 2 when the temporary tunnel expires.

## RegFunnel-only filtering

The Mailgun sending domain can carry traffic unrelated to RegFunnelOps. The webhook must therefore never persist every domain event blindly.

A Mailgun event is accepted into RegFunnelOps only when both conditions are true:

1. `event-data.user-variables.notification_id` exists.
2. That `notification_id` matches a `SendLog.notificationId` row whose result is `sent`.

Everything else returns HTTP 200 with `ignored: true` and is not written to the Events collection. This prevents normal marketing traffic on the same Mailgun domain from polluting RegFunnelOps analytics or triggering unnecessary template lookups.

Typical ignored responses:

```json
{
  "ok": true,
  "ignored": true,
  "reason": "missing_notification_id",
  "eventType": "delivered"
}
```

or:

```json
{
  "ok": true,
  "ignored": true,
  "reason": "unknown_notification_id",
  "eventType": "delivered"
}
```

Mailgun's built-in webhook Test normally does not carry a real RegFunnel notification ID, so an ignored test response is expected after this filter is enabled. A real fresh RegFunnel send is required for end-to-end validation.

## Identity bridge

The OneSignal-generated Mailgun event payload includes the custom RegFunnel variables we need:

- `notification_id`
- `app_id`
- optional `region`

The webhook reads these from Mailgun `user-variables` and stores the same `notification_id` on the normalized event.

`notification_id` is the bridge back to `SendLog.notificationId`.

```text
FunnelEnrollment
  -> SendLog.externalId
  -> SendLog.notificationId
  -> Mailgun user-variables.notification_id
  -> Events.notificationId
  -> RegFunnelOps Send Health / user timeline
```

## Security

Mailgun signs each webhook request. `/api/webhooks/mailgun` verifies the HMAC signature with `MAILGUN_SIGNING_KEY` before accepting the event.

The receiver also supports Mailgun parent signatures for account/subaccount webhook setups while retaining the same HMAC verification.

Do not add a development bypass that disables signature verification. Local traffic arriving through the Cloudflare tunnel is verified exactly the same way as production traffic.

## Validation

1. Run Payload/Next locally with `MAILGUN_SIGNING_KEY` present.
2. Verify `GET http://localhost:3000/api/webhooks/mailgun` returns `signingKeyConfigured: true`.
3. Start the Cloudflare tunnel and add its HTTPS Mailgun webhook URL.
4. Use Mailgun Test and confirm the endpoint returns HTTP 200. An ignored `missing_notification_id` response is expected for the synthetic test payload.
5. Send a fresh RegFunnelOps test email through the normal Sender workflow.
6. Confirm `SendLog` contains a non-empty `notificationId`.
7. Wait for Mailgun `delivered`.
8. Confirm the local `events` collection receives an event with the same `notificationId` and `eventType=delivered`.
9. Refresh local RegFunnelOps.
10. Confirm Send Health shows delivered data and the delivery-tracking warning disappears.
11. Open `/regfunnel/enrollment/{id}` and confirm delivery/open/click events appear in the activity timeline.

## Existing test data

Webhook tracking is real-time. Old sends that happened before the webhook was configured will not automatically gain delivery events. Validate the integration with a fresh send.
