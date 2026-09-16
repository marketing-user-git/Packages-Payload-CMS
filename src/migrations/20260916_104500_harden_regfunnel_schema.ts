import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_funnel_enrollment_state"
      ADD VALUE IF NOT EXISTS 'excluded';

    ALTER TYPE "public"."enum_funnel_config_restriction_rules_conditions_op"
      ADD VALUE IF NOT EXISTS 'not_exists';

    ALTER TYPE "public"."enum_funnel_config_step_restrictions_conditions_op"
      ADD VALUE IF NOT EXISTS 'not_exists';

    ALTER TYPE "public"."enum_funnel_config_conversion_rules_conditions_op"
      ADD VALUE IF NOT EXISTS 'not_exists';

    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "provider_event_id" varchar;

    CREATE UNIQUE INDEX IF NOT EXISTS "events_provider_event_id_unique_idx"
      ON "events" ("provider_event_id")
      WHERE "provider_event_id" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "events_provider_event_id_unique_idx";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "provider_event_id";
  `)

  // Enum additions are intentionally not removed. PostgreSQL enum values cannot
  // be removed safely without rebuilding the enum and every dependent column.
}
