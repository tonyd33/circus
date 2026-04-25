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

export const chimpProfiles = pgTable("chimp_profiles", {
  chimpId: text("chimp_id").primaryKey(),
  profile: text("profile").notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
});
