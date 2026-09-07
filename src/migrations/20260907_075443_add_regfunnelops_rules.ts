import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_funnel_config_restriction_rules_conditions_op" AS ENUM('equals', 'not_equals', 'in', 'not_in', 'prefix', 'greater_than', 'less_than', 'exists');
  CREATE TYPE "public"."enum_funnel_config_restriction_rules_match" AS ENUM('any', 'all');
  CREATE TYPE "public"."enum_funnel_config_step_restrictions_conditions_op" AS ENUM('equals', 'not_equals', 'in', 'not_in', 'prefix', 'greater_than', 'less_than', 'exists');
  CREATE TYPE "public"."enum_funnel_config_step_restrictions_match" AS ENUM('any', 'all');
  CREATE TYPE "public"."enum_funnel_config_conversion_rules_conditions_op" AS ENUM('equals', 'not_equals', 'in', 'not_in', 'prefix', 'greater_than', 'less_than', 'exists');
  CREATE TYPE "public"."enum_funnel_config_conversion_rules_match" AS ENUM('any', 'all');
  CREATE TABLE "funnel_config_restricted_countries" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "funnel_config_restriction_rules_conditions" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"op" "enum_funnel_config_restriction_rules_conditions_op" NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "funnel_config_restriction_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"match" "enum_funnel_config_restriction_rules_match" DEFAULT 'any'
  );
  
  CREATE TABLE "funnel_config_step_restrictions_conditions" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"op" "enum_funnel_config_step_restrictions_conditions_op" NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "funnel_config_step_restrictions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"step_id" varchar NOT NULL,
  	"match" "enum_funnel_config_step_restrictions_match" DEFAULT 'any'
  );
  
  CREATE TABLE "funnel_config_conversion_rules_conditions" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"op" "enum_funnel_config_conversion_rules_conditions_op" NOT NULL,
  	"value" varchar
  );
  
  CREATE TABLE "funnel_config_conversion_rules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"match" "enum_funnel_config_conversion_rules_match" DEFAULT 'any'
  );
  
  DROP TABLE "funnel_config_restricted_steps_cnjp" CASCADE;
  ALTER TABLE "funnel_enrollment" ADD COLUMN "culture" varchar;
  ALTER TABLE "funnel_config" ADD COLUMN "max_tag_sync_retries" numeric DEFAULT 5 NOT NULL;
  ALTER TABLE "funnel_config" ADD COLUMN "enrollment_cutoff_date" timestamp(3) with time zone;
  ALTER TABLE "funnel_config" ADD COLUMN "one_signal_apps_identity_app_id" varchar;
  ALTER TABLE "funnel_config_restricted_countries" ADD CONSTRAINT "funnel_config_restricted_countries_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_restriction_rules_conditions" ADD CONSTRAINT "funnel_config_restriction_rules_conditions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config_restriction_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_restriction_rules" ADD CONSTRAINT "funnel_config_restriction_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_step_restrictions_conditions" ADD CONSTRAINT "funnel_config_step_restrictions_conditions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config_step_restrictions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_step_restrictions" ADD CONSTRAINT "funnel_config_step_restrictions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_conversion_rules_conditions" ADD CONSTRAINT "funnel_config_conversion_rules_conditions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config_conversion_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "funnel_config_conversion_rules" ADD CONSTRAINT "funnel_config_conversion_rules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "funnel_config_restricted_countries_order_idx" ON "funnel_config_restricted_countries" USING btree ("_order");
  CREATE INDEX "funnel_config_restricted_countries_parent_id_idx" ON "funnel_config_restricted_countries" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_restriction_rules_conditions_order_idx" ON "funnel_config_restriction_rules_conditions" USING btree ("_order");
  CREATE INDEX "funnel_config_restriction_rules_conditions_parent_id_idx" ON "funnel_config_restriction_rules_conditions" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_restriction_rules_order_idx" ON "funnel_config_restriction_rules" USING btree ("_order");
  CREATE INDEX "funnel_config_restriction_rules_parent_id_idx" ON "funnel_config_restriction_rules" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_step_restrictions_conditions_order_idx" ON "funnel_config_step_restrictions_conditions" USING btree ("_order");
  CREATE INDEX "funnel_config_step_restrictions_conditions_parent_id_idx" ON "funnel_config_step_restrictions_conditions" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_step_restrictions_order_idx" ON "funnel_config_step_restrictions" USING btree ("_order");
  CREATE INDEX "funnel_config_step_restrictions_parent_id_idx" ON "funnel_config_step_restrictions" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_conversion_rules_conditions_order_idx" ON "funnel_config_conversion_rules_conditions" USING btree ("_order");
  CREATE INDEX "funnel_config_conversion_rules_conditions_parent_id_idx" ON "funnel_config_conversion_rules_conditions" USING btree ("_parent_id");
  CREATE INDEX "funnel_config_conversion_rules_order_idx" ON "funnel_config_conversion_rules" USING btree ("_order");
  CREATE INDEX "funnel_config_conversion_rules_parent_id_idx" ON "funnel_config_conversion_rules" USING btree ("_parent_id");
  ALTER TABLE "funnel_enrollment" DROP COLUMN "email";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "funnel_config_restricted_steps_cnjp" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"step_id" varchar NOT NULL
  );
  
  DROP TABLE "funnel_config_restricted_countries" CASCADE;
  DROP TABLE "funnel_config_restriction_rules_conditions" CASCADE;
  DROP TABLE "funnel_config_restriction_rules" CASCADE;
  DROP TABLE "funnel_config_step_restrictions_conditions" CASCADE;
  DROP TABLE "funnel_config_step_restrictions" CASCADE;
  DROP TABLE "funnel_config_conversion_rules_conditions" CASCADE;
  DROP TABLE "funnel_config_conversion_rules" CASCADE;
  ALTER TABLE "funnel_enrollment" ADD COLUMN "email" varchar NOT NULL;
  ALTER TABLE "funnel_config_restricted_steps_cnjp" ADD CONSTRAINT "funnel_config_restricted_steps_cnjp_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."funnel_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "funnel_config_restricted_steps_cnjp_order_idx" ON "funnel_config_restricted_steps_cnjp" USING btree ("_order");
  CREATE INDEX "funnel_config_restricted_steps_cnjp_parent_id_idx" ON "funnel_config_restricted_steps_cnjp" USING btree ("_parent_id");
  ALTER TABLE "funnel_enrollment" DROP COLUMN "culture";
  ALTER TABLE "funnel_config" DROP COLUMN "max_tag_sync_retries";
  ALTER TABLE "funnel_config" DROP COLUMN "enrollment_cutoff_date";
  ALTER TABLE "funnel_config" DROP COLUMN "one_signal_apps_identity_app_id";
  DROP TYPE "public"."enum_funnel_config_restriction_rules_conditions_op";
  DROP TYPE "public"."enum_funnel_config_restriction_rules_match";
  DROP TYPE "public"."enum_funnel_config_step_restrictions_conditions_op";
  DROP TYPE "public"."enum_funnel_config_step_restrictions_match";
  DROP TYPE "public"."enum_funnel_config_conversion_rules_conditions_op";
  DROP TYPE "public"."enum_funnel_config_conversion_rules_match";`)
}
