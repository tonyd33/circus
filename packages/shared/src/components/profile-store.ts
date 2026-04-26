import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { chimpProfileDefinitions } from "../db/schema";
import type { ChimpProfile } from "../protocol";

export class ProfileStore {
  constructor(private db: Database) {}

  async get(name: string): Promise<ChimpProfile | null> {
    const rows = await this.db
      .select({ definition: chimpProfileDefinitions.definition })
      .from(chimpProfileDefinitions)
      .where(eq(chimpProfileDefinitions.name, name))
      .limit(1);
    return rows[0]?.definition ?? null;
  }

  async save(name: string, profile: ChimpProfile): Promise<void> {
    const now = new Date();
    await this.db
      .insert(chimpProfileDefinitions)
      .values({ name, definition: profile, updatedAt: now })
      .onConflictDoUpdate({
        target: chimpProfileDefinitions.name,
        set: { definition: profile, updatedAt: now },
      });
  }

  async delete(name: string): Promise<boolean> {
    const rows = await this.db
      .delete(chimpProfileDefinitions)
      .where(eq(chimpProfileDefinitions.name, name))
      .returning({ name: chimpProfileDefinitions.name });
    return rows.length > 0;
  }

  async list(): Promise<Record<string, ChimpProfile>> {
    const rows = await this.db
      .select({
        name: chimpProfileDefinitions.name,
        definition: chimpProfileDefinitions.definition,
      })
      .from(chimpProfileDefinitions);
    const profiles: Record<string, ChimpProfile> = {};
    for (const row of rows) {
      profiles[row.name] = row.definition;
    }
    return profiles;
  }

  async seedDefaults(defaults: Record<string, ChimpProfile>): Promise<boolean> {
    const existing = await this.db
      .select({ name: chimpProfileDefinitions.name })
      .from(chimpProfileDefinitions)
      .limit(1);
    if (existing.length > 0) return false;

    const entries = Object.entries(defaults);
    if (entries.length === 0) return false;

    const now = new Date();
    await this.db.insert(chimpProfileDefinitions).values(
      entries.map(([name, profile]) => ({
        name,
        definition: profile,
        updatedAt: now,
      })),
    );
    return true;
  }
}
