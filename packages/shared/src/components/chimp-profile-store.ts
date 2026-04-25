import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { chimpProfiles } from "../db/schema";

export class ChimpProfileStore {
  constructor(
    private db: Database,
    private defaultProfile: string,
  ) {}

  async getProfile(chimpId: string): Promise<string> {
    const row = await this.db
      .select({ profile: chimpProfiles.profile })
      .from(chimpProfiles)
      .where(eq(chimpProfiles.chimpId, chimpId))
      .limit(1)
      .then((rows) => rows[0]);

    return row?.profile ?? this.defaultProfile;
  }

  async setProfile(chimpId: string, profile: string): Promise<void> {
    await this.db
      .insert(chimpProfiles)
      .values({ chimpId, profile })
      .onConflictDoUpdate({
        target: chimpProfiles.chimpId,
        set: { profile, assignedAt: new Date() },
      });
  }
}
