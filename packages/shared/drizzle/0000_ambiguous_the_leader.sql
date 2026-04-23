CREATE TABLE "topic_subscriptions" (
	"topic_key" text NOT NULL,
	"chimp_id" text NOT NULL,
	"subscribed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topic_subscriptions_topic_key_chimp_id_pk" PRIMARY KEY("topic_key","chimp_id")
);
