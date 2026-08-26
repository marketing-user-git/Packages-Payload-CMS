# Marketing Analytics — Handoff

_Project: `pkg.easy-markets.com` (Payload CMS + Next.js 16 + Postgres). Adds a second "Marketing Analytics" app alongside the existing Packages app, behind a shared login._

---

## 1) Goal

Build a **global multichannel (email + push) analytics app** as a second application next to the existing Packages dashboard, sharing one login shell and one Payload/Postgres instance.

- **Email** events come from **Mailgun** (source of truth for delivered / opened / clicked / bounced / complained / unsubscribed).
- **Push** events come from **OneSignal** (two apps: `global` and `china`).
- OneSignal sends its emails **through** Mailgun, so email events are taken only from Mailgun to avoid double-counting; OneSignal is used only for push + for **template enrichment** (resolving `notification_id` → template).
- Data is ingested via **webhooks** into a raw `events` collection and rolled up into `analytics-daily`, so history is **permanent** in our Postgres (Mailgun only retains events ~30 days).
- Access is role-gated: **Sales → Packages only**, **Marketing → Analytics only**, **super-admin → both**.

---

## 2) Current State

**Working (local, on laptop `LEN-AS`):**
- ✅ **Auth**: Payload auth with username login, roles (`department`, `level`, `regions`, `superAdmin`), role-gated app picker. Users seeded.
- ✅ **Data layer**: `events` (raw), `analytics-daily` (rollup), `template-mappings`, `notifications-cache`, `campaigns`.
- ✅ **Dashboard**: tabs (Overview / Campaigns / Templates / Channels / Deliverability), period-over-period deltas, executive summary line, trend charts, deliverability health alerts, 1-year range with weekly grouping.
- ✅ **Campaigns**: admin-managed, many-to-many with templates; 3 demo campaigns seeded.
- ✅ **Webhooks**: Mailgun route with HMAC verification + template enrichment + dedup + rollup upsert. **Tested end-to-end locally** with a signed test payload (accepted/delivered/opened/clicked all returned 200).
- ✅ **OneSignal enrichment**: confirmed auth scheme is `Key` (not `Basic`); template sync pulls all 405 templates (285 global + 153 china).
- ✅ **Grouping**: Theme / Family / Template toggle (themes = keyword vocab; families = name prefix).

**Not done yet:**
- ❌ Not deployed to prod — everything runs locally.
- ❌ Dashboard still shows **mock data** (real template names have no `analytics-daily` rows until webhooks run in prod).
- ❌ OneSignal push webhook route is a **defensive skeleton** — needs a real payload sample to finalize.

**Environment note:** runs locally against local Postgres (`payload-packages` on `127.0.0.1`). Prod DB is on the Hostinger VPS (`srv1034886`). Do **not** test schema changes directly against prod.

---

## 3) Active Files

**Collections** (`src/collections/`)
- `Users.ts` — auth + `department`/`level`/`regions`/`superAdmin`, username login
- `Events.ts` — raw events (source of truth)
- `AnalyticsDaily.ts` — pre-aggregated rollup (what the dashboard reads)
- `AnalyticsSupport.ts` — `TemplateMappings` (+ `family` field) and `NotificationsCache`
- `Campaigns.ts` — user-managed campaigns (many-to-many → templates)
- `payload.config.ts` — registers all of the above

**Frontend** (`src/app/(frontend)/`)
- `AppShell.jsx` — Payload login + role-gated app picker; hands off to Packages or Analytics
- `AnalyticsDashboard.jsx` — the full analytics UI
- `page.tsx` — mounts `AppShell`
- `Dashboard.jsx` — existing Packages dashboard (only edit: `export` on `LOGO_B64` and `Dashboard`)

**Webhooks** (`src/app/api/webhooks/`)
- `mailgun/route.ts` — Mailgun ingestion (HMAC verified)
- `onesignal/route.ts` — push ingestion (skeleton; shared-secret via `?token=`)
- `src/lib/analytics/webhookUtils.ts` — shared verify / enrich / dedup / ingest / rollup logic

**Scripts** (`scripts/`)
- `seed-users.ts` — create/seed users
- `seed-analytics.ts` — mock rollups (1 year) + demo campaigns + mappings
- `sync-templates.ts` — pull real OneSignal templates → `template-mappings` (+ family)
- `test-mailgun-webhook.ts` — signed local webhook test
- `test-onesignal-enrich.ts` — verify OneSignal API auth + template resolution

**Env vars required** (`.env`)
```
PAYLOAD_SECRET=...
DATABASE_URL="postgres://postgres:<pw>@127.0.0.1:5432/payload-packages"   # quote if pw has special chars
MAILGUN_SIGNING_KEY=...
ONESIGNAL_GLOBAL_APP_ID=532fff1a-2b71-476a-822b-4b5806719330
ONESIGNAL_CHINA_APP_ID=5cf1733b-9242-49c3-b557-041a48c89b45
ONESIGNAL_GLOBAL_REST_KEY=...
ONESIGNAL_CHINA_REST_KEY=...
WEBHOOK_SHARED_SECRET=...
```

---

## 4) Changes Made

1. **Auth**: replaced the old client-side hardcoded `USERS` login with real Payload auth; added `Users` fields and a role-gated app picker. Migrated users via `seed-users.ts`.
2. **Data layer**: added `events`, `analytics-daily`, `template-mappings`, `notifications-cache` collections with indexes.
3. **Dashboard**: built full analytics UI; later added tabs, period-over-period deltas, executive summary, bigger ranges (up to 1 year) with weekly grouping.
4. **Campaigns**: added `campaigns` collection (many-to-many), campaign filter + Campaigns tab.
5. **Webhooks**: built Mailgun route + shared ingestion lib; verified HMAC; live rollup upsert so the dashboard updates without a cron.
6. **OneSignal**: confirmed `Key` auth scheme; built `sync-templates.ts` to import all templates; added `family` field and Theme/Family/Template grouping.
7. **Auth scheme fix**: changed `webhookUtils.ts` from `Basic` → `Key`.

---

## 5) Failed Attempts / Gotchas (so they aren't repeated)

- **`pnpm payload run` hangs silently on Windows/MINGW.** Use `node --import tsx scripts/<file>.ts` for all scripts instead. This was the root cause of the "seed produces no output" symptom.
- **`DATABASE_URL` with a `!` in the password** broke connection parsing. Fix: wrap the whole URL in double quotes in `.env` (raw `!`), or URL-encode as `%21`. Confirmed working password via `PGPASSWORD='...' psql ...`.
- **`pg` module went missing** after a `pnpm add` reshuffled `node_modules`, causing `getPayload` to hang. Fix: `rm -rf node_modules && pnpm install`.
- **Missing `PAYLOAD_SECRET`** caused `getPayload` init errors (500 on `/api/users/me`). Must be set and stable.
- **OneSignal auth scheme**: `Basic` returns errors; the correct scheme is **`Key <restKey>`** (confirmed via `test-onesignal-enrich.ts`).
- **TypeScript "collection not assignable" errors** in scripts are stale generated types — harmless; use `as any` on `data` or run `pnpm generate:types`.
- **Adding a new collection requires a dev-server restart** before seeding (so Payload creates the table), else `relation "..." does not exist`.
- **Template naming is highly varied**: 405 templates → 166 family prefixes, 119 of them singletons. Prefix families work for high-volume groups only; added keyword **themes** as a broader layer.
- **`app_id` is present** in Mailgun `user-variables`, but **template is not** — must resolve via `notification_id` → OneSignal View Message API. Some sends are ad-hoc (no `template_id`) → handled as fallback.
- **Region is not in Mailgun payloads** by default — needs to be passed as a `region` custom variable from OneSignal sends, else events land as region `Unknown`.

---

## 6) Next Steps

**To go live (priority order):**
1. **Backup prod DB** (`pg_dump`) — schema changed (Users, new collections, `family`).
2. **Deploy** current build to `pkg.easy-markets.com` via `auto-deploy.yml`.
3. **Set prod env vars** (all of the block above, with prod `DATABASE_URL`).
4. **Run seeds/sync in prod**: `seed-users.ts`, then `sync-templates.ts` (mappings + families). Do **not** run mock `seed-analytics.ts` in prod.
5. **Add the real Mailgun webhook**: `https://pkg.easy-markets.com/api/webhooks/mailgun` as a **third** domain-level webhook (leave the existing two — OneSignal's and `EmWebhooks` — untouched).
6. **Send a test email**, confirm events land in `events` + `analytics-daily`, then **clear mock** `analytics-daily` rows.

**To finalize push:**
7. Capture a **real OneSignal webhook payload** (the route logs the raw body), then finalize `onesignal/route.ts` field mapping — same approach used for Mailgun.
8. Add a `region` custom variable to OneSignal sends so email events carry region.

**UI extras (any order, on real data):**
9. ~~Export (CSV / PDF) of reports.~~ ✅ Done — `Export ▾` menu in the filter bar (`src/lib/analytics/exportReport.js`): Summary / Templates / Campaigns / Regions / Daily-rows CSV, plus **Print / Save as PDF** via the browser print dialog (no PDF library; `PRINT_CSS` + `.no-print` hide the chrome and `PrintHeader` stamps the active filters onto the page).
10. ~~Time-of-day / day-of-week heatmap.~~ ✅ Done — new **Timing** tab. Reads raw `events` (lazily, only when the tab is opened, scoped to the selected range) and renders a 7 × 24 day×hour heatmap with Opens/Clicks/Delivered toggle and a peak-slot callout. **Falls back to a day-of-week-only strip built from `analytics-daily`** while `events` is empty — which is the case locally, since the mock seed only fills the rollup. The full heatmap lights up once the prod webhooks are ingesting.
11. In-app campaign builder (replace `/admin` CRUD).
12. Alerts + scheduled weekly reports (n8n is a good fit).

**Housekeeping:**
- Remove debug logs from `seed-users.ts`; delete `test-db.mjs` / `test-config.mjs` if still present.
- **Rotate secrets** shared during debugging: DB password (`Marketing2026!`) and any user passwords in `seed-users.ts`.
- Consider tightening collection `read` access (currently `() => true` for consistency with existing collections).
