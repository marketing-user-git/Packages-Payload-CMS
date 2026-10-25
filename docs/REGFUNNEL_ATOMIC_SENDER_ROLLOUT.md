# RegFunnelOps Atomic Sender — Staging rollout

**Status: CODE DRAFT / NOT DEPLOYED / NO LIVE TESTS.** Do not merge, deploy, or enable the n8n schedule before the acceptance checks below.

## What changed

- New private `POST /api/regfunnel/dispatch` route with 3 actions: `claim`, `begin`, `finalize`.
- A separate `regfunnel_dispatch_claim` table, unique on `(enrollment_id, step_id)`, prevents two executions from beginning independent sends.
- Each claim retains an immutable UUIDv4 `idempotency_key`. Each send attempt is tracked in append-only `regfunnel_dispatch_attempt`.
- `finalize` updates legacy `send_log` and `funnel_enrollment` within one PostgreSQL transaction.
- A failed or ambiguous provider request puts that enrollment into `needs_review` and pauses it, rather than retrying blindly.
- Pre-cutover `send_log.result='sent'` is checked before granting a claim. This safely repairs delayed enrollment progression without creating another notification.
- A legacy `error` with `error_detail='no_template_or_app_id'` is treated as a known pre-send failure. Other historical `error` outcomes are quarantined.
- `claimed` records can be reclaimed after 5 minutes only if `begin` did not execute. A stale `dispatching` claim (3 minutes) is quarantined, never automatically re-sent.
- `retryable_no_recipient` rotates its provider idempotency key only after an explicit no-recipient response; unknown responses go to manual review.

## No-reentry business rule

The current `FunnelEnrollment.externalId` is `unique: true`, so no re-entry is allowed. This implementation does not remove that constraint. Dispatch identity uses `(enrollment_id, step_id)` in the new claim table while leaving the original analytics log and indexes unchanged.

## Deployment sequence (staging first)

1. Disable the currently active 10-minute scheduled n8n sender and ensure running executions have ended. **Do not retry failed executions or delete SendLogs.**
2. Backup PostgreSQL. Run read-only audit to verify production tables, enum types, unique indexes, current enrollment progress and SendLog #33265.
3. Apply migration `20261025_150000_regfunnel_atomic_claims` in **staging**. Verify its tables and constraints.
4. Set `REGFUNNEL_SENDER_TOKEN` (cryptographically random, 32+ characters) in the Payload server environment. Restart/stage-deploy the backend.
5. Import `RegFunnelOps_2_Atomic_Sender_STAGING.json` as a **new, inactive** n8n workflow. Configure the **three** HTTP nodes `Atomic Claim`, `Atomic Begin` and `Atomic Finalize` with an HTTP Header Auth credential: header name `x-regfunnel-token`, value exactly the server token.
6. Verify that the original OneSignal Global/China credentials are mapped to the copied workflow's send and completion-tag nodes. Verify the existing Payload API Key credential for all original non-atomic collection/global nodes.
7. In an isolated staging DB and test OneSignal app, test all cases below. A copied production DB must have identifiers replaced or sending blocked.
8. Add monitoring / notification for `needs_review` and for paused enrollments (the staging workflow currently logs a warning instead of sending Telegram).
9. Only after QA, roll out using initially 50 due users per run and a 30-minute schedule. Observe results and backlogs; move to 10 minutes only after race tests and operational monitoring are green.

**Production is not changed by the GitHub branch or by importing the staging JSON.**

## n8n orchestration

`pre-send eligibility → atomic claim → atomic begin → OneSignal send → Interpret → atomic finalize → (optional completion tag) → next item`.

The old `Already Sent?`, `Insert SendLog`, `Compute Next` and `Advance` nodes remain in the export for reference but are bypassed on the normal sending branch. The old no-template and other non-send branches remain in place.

## Acceptance tests — required

- Two simultaneous claims for one enrollment/step: **one** `claimed`, one `busy` or `stale_enrollment`, only one `begin` returns `send`.
- Invalid / superseded claimToken on `begin` or `finalize`: returns `fenced`, never sends or modifies state.
- Crash between claim and begin: stale `claimed` can be taken over, and the former token cannot begin.
- Crash after begin, before OneSignal: stale `dispatching` goes to `needs_review`; no blind retry.
- Crash after OneSignal success, before finalize: no additional notification is created automatically. Reconcile manually with retained key and OneSignal's 30-day window.
- Duplicate finalize HTTP request: reports already finalized, does not increment `send_index` twice.
- Existing sent log #33265: no fresh send; enrollment advances only when its current index matches that step.
- Explicit no-recipient: retry deferred, next retry uses a fresh key (only for confirmed non-send response).
- Ambiguous API failure or timeout: paused and flagged `needs_review`, not immediately retried.
- Final step: state becomes `completed`, `next_send_at=NULL`, and the completion tag is applied (or alerted/reconciled if tagging fails).
- Conversion/exclusion during sending: never reverts an already converted/excluded enrollment.
- `Events` analytics still joins on legacy `send_log.notification_id`.
- Run `pnpm build`, migrations on staging Postgres and n8n real HTTP integration tests. These have **not** been run here.

## Follow-up requirements

- Implement a controlled `needs_review` monitor with a durable Telegram/ops alert.
- Add a reviewed reconciliation path for stale dispatching outcomes; never auto-retry a provider call after its dedupe window.
- Confirm the live database's index definitions. The repository has a partial unique index over `send_log (external_id,step_id) WHERE result='sent'`.
- Confirm timezone and the current `interval_days` config before enabling.
- Block manual execution of production OneSignal nodes when validating node expressions.
