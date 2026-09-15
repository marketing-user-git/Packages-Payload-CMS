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

Mailgun supports up to 3 unique URLs per event type, so production and local development can be configured at the same time. Keep the production URL and add the active tunnel URL as a second URL while testing locally.

## Configure in Mailgun

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
4. Send a fresh RegFunnelOps test email through the normal Sender workflow.
5. Confirm `SendLog` contains a non-empty `notificationId`.
6. Wait for Mailgun `delivered`.
7. Confirm the local `events` collection receives an event with the same `notificationId` and `eventType=delivered`.
8. Refresh local RegFunnelOps.
9. Confirm Send Health shows delivered data and the delivery-tracking warning disappears.
10. Open `/regfunnel/enrollment/{id}` and confirm delivery/open/click events appear in the activity timeline.

## Existing test data

Webhook tracking is real-time. Old sends that happened before the webhook was configured will not automatically gain delivery events. Validate the integration with a fresh send.
