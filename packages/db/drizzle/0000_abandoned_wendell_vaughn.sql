CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"run_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"step_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"run_id" text,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"surface_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_clarifications" (
	"run_id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"question" text NOT NULL,
	"placeholder" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"parent_step_id" text,
	"sequence" integer NOT NULL,
	"artifact_id" text,
	"artifact_kind" text,
	"detail" text,
	"logs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"status" text NOT NULL,
	"prompt" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "artifacts_run_sequence_idx" ON "artifacts" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "messages_session_created_idx" ON "messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "run_events_run_sequence_idx" ON "run_events" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "run_steps_run_sequence_idx" ON "run_steps" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "runs_session_created_idx" ON "runs" USING btree ("session_id","created_at");