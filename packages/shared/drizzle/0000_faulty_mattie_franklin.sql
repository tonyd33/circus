CREATE TABLE "chimp_profile_definitions" (
	"name" text PRIMARY KEY NOT NULL,
	"definition" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chimp_profiles" (
	"chimp_id" text PRIMARY KEY NOT NULL,
	"profile" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chimp_states" (
	"chimp_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_subscriptions" (
	"topic_key" text NOT NULL,
	"chimp_id" text NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topic_subscriptions_topic_key_chimp_id_pk" PRIMARY KEY("topic_key","chimp_id")
);
