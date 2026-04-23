import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const topicSubscriptions = pgTable(
  "topic_subscriptions",
  {
    topicKey: text("topic_key").notNull(),
    chimpId: text("chimp_id").notNull(),
    subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.topicKey, t.chimpId] })],
);
