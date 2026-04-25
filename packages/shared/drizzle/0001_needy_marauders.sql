CREATE TABLE "chimp_profiles" (
	"chimp_id" text PRIMARY KEY NOT NULL,
	"profile" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
