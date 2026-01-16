CREATE TABLE "claim_flow_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"flow_definition_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_phase_id" varchar(100),
	"current_phase_index" integer DEFAULT 0 NOT NULL,
	"completed_movements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dynamic_movements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT NOW(),
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT NOW(),
	"updated_at" timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "flow_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"peril_type" varchar(50) NOT NULL,
	"property_type" varchar(50) DEFAULT 'residential' NOT NULL,
	"flow_json" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT NOW(),
	"updated_at" timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "movement_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_instance_id" uuid NOT NULL,
	"movement_id" varchar(200) NOT NULL,
	"claim_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"notes" text,
	"evidence_data" jsonb,
	"completed_at" timestamp DEFAULT NOW(),
	"completed_by" uuid,
	"created_at" timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "movement_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_instance_id" uuid NOT NULL,
	"movement_id" varchar(200) NOT NULL,
	"evidence_type" varchar(30) NOT NULL,
	"reference_id" varchar(100),
	"evidence_data" jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ms365_tokens" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_checklists" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "claim_checklists" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "briefing_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "workflow_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "origin" varchar(30) DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "source_rule_id" varchar(100);--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "conditions" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "evidence_requirements" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "blocking" varchar(20) DEFAULT 'advisory';--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "blocking_condition" jsonb;--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "geometry_binding" jsonb;--> statement-breakpoint
ALTER TABLE "inspection_workflow_steps" ADD COLUMN "endorsement_source" varchar(100);--> statement-breakpoint
ALTER TABLE "user_ms365_tokens" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "claim_flow_instances" ADD CONSTRAINT "claim_flow_instances_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_flow_instances" ADD CONSTRAINT "claim_flow_instances_flow_definition_id_flow_definitions_id_fk" FOREIGN KEY ("flow_definition_id") REFERENCES "public"."flow_definitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_completions" ADD CONSTRAINT "movement_completions_flow_instance_id_claim_flow_instances_id_fk" FOREIGN KEY ("flow_instance_id") REFERENCES "public"."claim_flow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_completions" ADD CONSTRAINT "movement_completions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_evidence" ADD CONSTRAINT "movement_evidence_flow_instance_id_claim_flow_instances_id_fk" FOREIGN KEY ("flow_instance_id") REFERENCES "public"."claim_flow_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_flow_instances_claim_idx" ON "claim_flow_instances" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_flow_instances_status_idx" ON "claim_flow_instances" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claim_flow_instances_flow_def_idx" ON "claim_flow_instances" USING btree ("flow_definition_id");--> statement-breakpoint
CREATE INDEX "flow_definitions_org_idx" ON "flow_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "flow_definitions_peril_idx" ON "flow_definitions" USING btree ("peril_type");--> statement-breakpoint
CREATE INDEX "flow_definitions_property_idx" ON "flow_definitions" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "flow_definitions_active_idx" ON "flow_definitions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "movement_completions_flow_instance_idx" ON "movement_completions" USING btree ("flow_instance_id");--> statement-breakpoint
CREATE INDEX "movement_completions_movement_idx" ON "movement_completions" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "movement_completions_claim_idx" ON "movement_completions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "movement_evidence_flow_instance_idx" ON "movement_evidence" USING btree ("flow_instance_id");--> statement-breakpoint
CREATE INDEX "movement_evidence_movement_idx" ON "movement_evidence" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "movement_evidence_type_idx" ON "movement_evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "sessions_expire_idx" ON "sessions" USING btree ("expire");--> statement-breakpoint
ALTER TABLE "claim_checklists" ADD CONSTRAINT "claim_checklists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_carrier_id_carrier_profiles_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carrier_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimate_line_items" ADD CONSTRAINT "estimate_line_items_damage_zone_id_damage_zones_id_fk" FOREIGN KEY ("damage_zone_id") REFERENCES "public"."damage_zones"("id") ON DELETE set null ON UPDATE no action;