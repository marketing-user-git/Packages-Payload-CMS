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
  `)
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Intentionally irreversible. PostgreSQL enum values cannot be removed safely
  // without rebuilding the enum and every dependent column. Removing these values
  // could also invalidate existing production rows/rules.
}
