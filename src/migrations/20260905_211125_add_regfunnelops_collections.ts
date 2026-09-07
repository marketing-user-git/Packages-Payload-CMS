import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
-- ===== enums (guarded: CREATE TYPE has no IF NOT EXISTS) =====
DO $$ BEGIN CREATE TYPE "public"."enum_funnel_enrollment_funnel_region" AS ENUM('ROW','CNJP'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_funnel_enrollment_os_app" AS ENUM('global','china'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_funnel_enrollment_variant" AS ENUM('A','B'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_funnel_enrollment_state" AS ENUM('in_progress','converted','completed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_send_log_variant" AS ENUM('A','B'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_send_log_os_app" AS ENUM('global','china'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_send_log_result" AS ENUM('sent','skipped_converted','skipped_no_recipient','error'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "public"."enum_funnel_config_templates_variant" AS ENUM('A','B'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== tables =====
CREATE TABLE IF NOT EXISTS "funnel_enrollment" (
  "id" serial PRIMARY KEY NOT NULL,
  "external_id" varchar NOT NULL,
  "email" varchar NOT NULL,
  "country" varchar,
  "language" varchar,
  "funnel_region" "enum_funnel_enrollment_funnel_region" NOT NULL,
  "os_app" "enum_funnel_enrollment_os_app" DEFAULT 'global' NOT NULL,
  "variant" "enum_funnel_enrollment_variant" NOT NULL,
  "state" "enum_funnel_enrollment_state" DEFAULT 'in_progress' NOT NULL,
  "current_step" varchar DEFAULT '00_no_email_yet',
  "last_sent_step" varchar,
  "send_index" numeric DEFAULT 0 NOT NULL,
  "enrolled_at" timestamp(3) with time zone NOT NULL,
  "next_send_at" timestamp(3) with time zone,
  "converted_at" timestamp(3) with time zone,
  "converted_at_step" varchar,
  "completed_at" timestamp(3) with time zone,
  "paused" boolean DEFAULT false,
  "excluded" boolean DEFAULT false,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "send_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "external_id" varchar NOT NULL,
  "step_id" varchar NOT NULL,
  "variant" "enum_send_log_variant",
  "os_app" "enum_send_log_os_app",
  "template_id" varchar,
  "notification_id" varchar,
  "attempted_at" timestamp(3) with time zone NOT NULL,
  "result" "enum_send_log_result" NOT NULL,
  "error_detail" varchar,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "funnel_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "status_registered_value" varchar DEFAULT 'NON ACTIVE' NOT NULL,
  "status_active_value" varchar DEFAULT 'ACTIVE' NOT NULL,
  "first_delay_hours" numeric DEFAULT 1 NOT NULL,
  "interval_days" numeric DEFAULT 2 NOT NULL,
  "one_signal_apps_global_app_id" varchar,
  "one_signal_apps_global_key_ref" varchar,
  "one_signal_apps_china_app_id" varchar,
  "one_signal_apps_china_key_ref" varchar,
  "updated_at" timestamp(3) with time zone,
  "created_at" timestamp(3) with time zone
);

CREATE TABLE IF NOT EXISTS "funnel_config_cnjp_countries" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "value" varchar NOT NULL );
CREATE TABLE IF NOT EXISTS "funnel_config_china_countries" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "value" varchar NOT NULL );
CREATE TABLE IF NOT EXISTS "funnel_config_sequence_row" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "step_id" varchar NOT NULL );
CREATE TABLE IF NOT EXISTS "funnel_config_sequence_cnjp" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "step_id" varchar NOT NULL );
CREATE TABLE IF NOT EXISTS "funnel_config_restricted_steps_cnjp" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "step_id" varchar NOT NULL );
CREATE TABLE IF NOT EXISTS "funnel_config_templates" (
  "_order" integer NOT NULL, "_parent_id" integer NOT NULL,
  "id" varchar PRIMARY KEY NOT NULL, "step_id" varchar NOT NULL,
  "variant" "enum_funnel_config_templates_variant" NOT NULL,
  "global" varchar, "china" varchar );

-- ===== add rel columns to the EXISTING locked-documents rels table =====
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "funnel_enrollment_id" integer;
ALTER TABLE "payload_locked_documents_rels" ADD COLUMN IF NOT EXISTS "send_log_id" integer;

-- ===== foreign keys (guarded) =====
DO $$ BEGIN ALTER TABLE "funnel_config_cnjp_countries" ADD CONSTRAINT "funnel_config_cnjp_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "funnel_config_china_countries" ADD CONSTRAINT "funnel_config_china_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "funnel_config_sequence_row" ADD CONSTRAINT "funnel_config_sequence_row_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "funnel_config_sequence_cnjp" ADD CONSTRAINT "funnel_config_sequence_cnjp_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "funnel_config_restricted_steps_cnjp" ADD CONSTRAINT "funnel_config_restricted_steps_cnjp_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "funnel_config_templates" ADD CONSTRAINT "funnel_config_templates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_funnel_enrollment_fk" FOREIGN KEY ("funnel_enrollment_id") REFERENCES "public"."funnel_enrollment"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_send_log_fk" FOREIGN KEY ("send_log_id") REFERENCES "public"."send_log"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== indexes =====
CREATE UNIQUE INDEX IF NOT EXISTS "funnel_enrollment_external_id_idx" ON "funnel_enrollment" ("external_id");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_funnel_region_idx" ON "funnel_enrollment" ("funnel_region");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_os_app_idx" ON "funnel_enrollment" ("os_app");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_variant_idx" ON "funnel_enrollment" ("variant");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_state_idx" ON "funnel_enrollment" ("state");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_next_send_at_idx" ON "funnel_enrollment" ("next_send_at");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_paused_idx" ON "funnel_enrollment" ("paused");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_excluded_idx" ON "funnel_enrollment" ("excluded");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_updated_at_idx" ON "funnel_enrollment" ("updated_at");
CREATE INDEX IF NOT EXISTS "funnel_enrollment_created_at_idx" ON "funnel_enrollment" ("created_at");

CREATE INDEX IF NOT EXISTS "send_log_external_id_idx" ON "send_log" ("external_id");
CREATE INDEX IF NOT EXISTS "send_log_step_id_idx" ON "send_log" ("step_id");
CREATE INDEX IF NOT EXISTS "send_log_os_app_idx" ON "send_log" ("os_app");
CREATE INDEX IF NOT EXISTS "send_log_notification_id_idx" ON "send_log" ("notification_id");
CREATE INDEX IF NOT EXISTS "send_log_result_idx" ON "send_log" ("result");
CREATE INDEX IF NOT EXISTS "send_log_updated_at_idx" ON "send_log" ("updated_at");
CREATE INDEX IF NOT EXISTS "send_log_created_at_idx" ON "send_log" ("created_at");
CREATE INDEX IF NOT EXISTS "externalId_stepId_idx" ON "send_log" ("external_id","step_id");

CREATE INDEX IF NOT EXISTS "funnel_config_cnjp_countries_order_idx" ON "funnel_config_cnjp_countries" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_cnjp_countries_parent_id_idx" ON "funnel_config_cnjp_countries" ("_parent_id");
CREATE INDEX IF NOT EXISTS "funnel_config_china_countries_order_idx" ON "funnel_config_china_countries" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_china_countries_parent_id_idx" ON "funnel_config_china_countries" ("_parent_id");
CREATE INDEX IF NOT EXISTS "funnel_config_sequence_row_order_idx" ON "funnel_config_sequence_row" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_sequence_row_parent_id_idx" ON "funnel_config_sequence_row" ("_parent_id");
CREATE INDEX IF NOT EXISTS "funnel_config_sequence_cnjp_order_idx" ON "funnel_config_sequence_cnjp" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_sequence_cnjp_parent_id_idx" ON "funnel_config_sequence_cnjp" ("_parent_id");
CREATE INDEX IF NOT EXISTS "funnel_config_restricted_steps_cnjp_order_idx" ON "funnel_config_restricted_steps_cnjp" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_restricted_steps_cnjp_parent_id_idx" ON "funnel_config_restricted_steps_cnjp" ("_parent_id");
CREATE INDEX IF NOT EXISTS "funnel_config_templates_order_idx" ON "funnel_config_templates" ("_order");
CREATE INDEX IF NOT EXISTS "funnel_config_templates_parent_id_idx" ON "funnel_config_templates" ("_parent_id");

CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_funnel_enrollment_id_idx" ON "payload_locked_documents_rels" ("funnel_enrollment_id");
CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_send_log_id_idx" ON "payload_locked_documents_rels" ("send_log_id");

-- ===== idempotency backstop: a step is 'sent' at most once per user =====
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sendlog_sent_once" ON "send_log" ("external_id","step_id") WHERE "result" = 'sent';
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
DROP INDEX IF EXISTS "uq_sendlog_sent_once";
ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "funnel_enrollment_id";
ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "send_log_id";
DROP TABLE IF EXISTS "funnel_config_templates" CASCADE;
DROP TABLE IF EXISTS "funnel_config_restricted_steps_cnjp" CASCADE;
DROP TABLE IF EXISTS "funnel_config_sequence_cnjp" CASCADE;
DROP TABLE IF EXISTS "funnel_config_sequence_row" CASCADE;
DROP TABLE IF EXISTS "funnel_config_china_countries" CASCADE;
DROP TABLE IF EXISTS "funnel_config_cnjp_countries" CASCADE;
DROP TABLE IF EXISTS "funnel_config" CASCADE;
DROP TABLE IF EXISTS "send_log" CASCADE;
DROP TABLE IF EXISTS "funnel_enrollment" CASCADE;
DROP TYPE IF EXISTS "enum_funnel_config_templates_variant";
DROP TYPE IF EXISTS "enum_send_log_result";
DROP TYPE IF EXISTS "enum_send_log_os_app";
DROP TYPE IF EXISTS "enum_send_log_variant";
DROP TYPE IF EXISTS "enum_funnel_enrollment_state";
DROP TYPE IF EXISTS "enum_funnel_enrollment_variant";
DROP TYPE IF EXISTS "enum_funnel_enrollment_os_app";
DROP TYPE IF EXISTS "enum_funnel_enrollment_funnel_region";
  `)
}