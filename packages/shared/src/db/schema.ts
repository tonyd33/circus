import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { ChimpProfile } from "../protocol";

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

export const chimpStates = pgTable("chimp_states", {
  chimpId: text("chimp_id").primaryKey(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chimpProfileDefinitions = pgTable("chimp_profile_definitions", {
  name: text("name").primaryKey(),
  definition: jsonb("definition").$type<ChimpProfile>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
