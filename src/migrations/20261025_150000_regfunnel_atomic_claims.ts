import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

/**
 * Sender claim fencing and immutable attempt history.
 *
 * Does not alter legacy send_log or its partial unique sent index.
 * Legacy send_log is still the analytics join source by notification_id.
 *
 * Safe deployment order:
 *   1. Stop sender and finish/cancel running executions.
 *   2. Backup production database.
 *   3. Apply this migration.
 *   4. Deploy the new API endpoints.
 *   5. Switch the n8n workflow and run isolated test recipients.
 *   6. Enable scheduled sender after verification.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "regfunnel_dispatch_claim" (
      "id" bigserial PRIMARY KEY,
      "enrollment_id" integer NOT NULL REFERENCES "funnel_enrollment"("id") ON DELETE RESTRICT,
      "external_id" varchar NOT NULL,
      "step_id" varchar NOT NULL,
      "send_index" integer NOT NULL,
      "variant" varchar NOT NULL,
      "os_app" varchar NOT NULL,
      "template_id" varchar NOT NULL,
      "app_id" varchar NOT NULL,
      "status" varchar NOT NULL CHECK ("status" IN (
        'claimed', 'dispatching', 'sent', 'retryable_no_recipient', 'needs_review'
      )),
      "claim_token" uuid NOT NULL,
      "idempotency_key" uuid NOT NULL,
      "notification_id" varchar,
      "claimed_at" timestamptz NOT NULL DEFAULT now(),
      "dispatch_started_at" timestamptz,
      "completed_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "regfunnel_dispatch_claim_one_step" UNIQUE ("enrollment_id", "step_id")
    );
    CREATE INDEX IF NOT EXISTS "regfunnel_dispatch_claim_status_idx"
      ON "regfunnel_dispatch_claim"("status");

    CREATE TABLE IF NOT EXISTS "regfunnel_dispatch_attempt" (
      "id" bigserial PRIMARY KEY,
      "claim_id" bigint NOT NULL REFERENCES "regfunnel_dispatch_claim"("id") ON DELETE RESTRICT,
      "claim_token" uuid NOT NULL,
      "idempotency_key" uuid NOT NULL,
      "result" varchar NOT NULL,
      "notification_id" varchar,
      "error_detail" text,
      "created_at" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "regfunnel_dispatch_attempt_claim_idx"
      ON "regfunnel_dispatch_attempt"("claim_id", "created_at");
  `)
}

// Intentionally non-destructive: rolling back application code must not erase send history.
export async function down(_args: MigrateDownArgs): Promise<void> {
  throw new Error('Manual review required before dropping RegFunnel dispatch/audit tables.')
}
