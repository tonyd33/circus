import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { chimpStates } from "../db/schema";
import type { ChimpState, ChimpStatus } from "../standards/chimp";

export class StateManager {
  constructor(private db: Database) {}

  async upsert(chimpId: string, status: ChimpStatus): Promise<void> {
    const now = new Date();
    await this.db
      .insert(chimpStates)
      .values({ chimpId, status, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: chimpStates.chimpId,
        set: { status, updatedAt: now },
      });
  }

  async get(chimpId: string): Promise<ChimpState | null> {
    const rows = await this.db
      .select()
      .from(chimpStates)
      .where(eq(chimpStates.chimpId, chimpId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      chimpId: row.chimpId,
      status: row.status as ChimpStatus,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    };
  }

  async delete(chimpId: string): Promise<void> {
    await this.db.delete(chimpStates).where(eq(chimpStates.chimpId, chimpId));
  }

  async list(): Promise<ChimpState[]> {
    const rows = await this.db.select().from(chimpStates);
    return rows.map((row) => ({
      chimpId: row.chimpId,
      status: row.status as ChimpStatus,
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }));
  }
}
