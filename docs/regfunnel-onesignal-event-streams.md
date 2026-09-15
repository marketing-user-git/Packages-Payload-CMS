# RegFunnelOps — OneSignal Event Streams

RegFunnelOps delivery/open/click tracking is ingested through the existing endpoint:

`POST /api/webhooks/onesignal`

The endpoint stores normalized events in the `events` collection and the RegFunnelOps dashboard joins them back to `SendLog` by OneSignal `message.id` / `notificationId`.

## Configure in BOTH OneSignal apps

Create the same Event Stream in:

- Global app
- China app

Recommended destination after production cutover:

`https://pkg.easy-markets.com/api/webhooks/onesignal`

During local testing, use the current public tunnel domain with the same path. `localhost` cannot receive OneSignal Event Stream requests.

### HTTP

- Method: `POST`
- Header: `Content-Type: application/json`
- Header: `Authorization: Bearer <WEBHOOK_SHARED_SECRET>`

`WEBHOOK_SHARED_SECRET` must match the environment variable configured in Payload.

## Events

Enable the email events needed by RegFunnelOps:

- Email Received
- Email Opened
- Email Link Clicked
- Email Unsubscribed
- Email Reported As Spam
- Email Bounced
- Email Failed
- Email Suppressed

`Email Received` is the dashboard's delivered event. OneSignal no longer allows `Email Sent` to be added to new Event Streams, so RegFunnelOps continues to use its own `SendLog` as the source of truth for sends.

## JSON body

```json
{
  "event.kind": "{{ event.kind }}",
  "event.id": "{{ event.id }}",
  "event.timestamp": {{ event.timestamp }},
  "event.datetime": "{{ event.datetime }}",
  "event.app_id": "{{ event.app_id }}",
  "event.subscription_id": "{{ event.subscription_id }}",
  "event.external_id": "{{ event.external_id }}",
  "event.data.failure_reason": "{{ event.data.failure_reason }}",
  "message.id": "{{ message.id }}",
  "message.template_id": "{{ message.template_id }}",
  "message.template_name": "{{ message.template_name }}",
  "user.subscription.id": "{{ user.subscription.id }}",
  "user.subscription.app_id": "{{ user.subscription.app_id }}",
  "user.subscription.subscription_token": "{{ user.subscription.subscription_token }}"
}
```

## Validation

After enabling the stream:

1. Send a new RegFunnelOps test email through the normal sender flow.
2. Confirm the OneSignal send returns a `notificationId` and it is stored in `SendLog`.
3. Wait for the Event Stream `message.email.received` event.
4. Confirm an `events` row exists with the same `notificationId` and `eventType=delivered`.
5. Refresh RegFunnelOps. Send Health should now show delivery data and the delivery-tracking notification should disappear for a cohort with captured delivery events.
6. Open the custom enrollment detail view and confirm the Delivered event appears in the activity timeline.

## Important

Event Streams are real-time forwarding, not a historical backfill mechanism. Existing old test sends will remain without delivery events unless those events were previously captured. Validate with a fresh test send after the stream is enabled.
