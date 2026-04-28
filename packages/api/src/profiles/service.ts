import { Protocol } from "@mnke/circus-shared";
import type { ProfileStore } from "@mnke/circus-shared/components";
import type * as Logger from "@mnke/circus-shared/logger";

export class ProfileService {
  constructor(
    private store: ProfileStore,
    private logger: Logger.Logger,
  ) {}

  async list() {
    return this.store.list();
  }

  async get(name: string) {
    return this.store.get(name);
  }

  async save(
    name: string,
    body: unknown,
  ): Promise<{ ok: true } | { error: unknown }> {
    const parsed = Protocol.ChimpProfileSchema.safeParse(body);
    if (!parsed.success) {
      return { error: parsed.error.flatten() };
    }
    await this.store.save(name, parsed.data);
    this.logger.info({ name }, "Profile saved");
    return { ok: true };
  }

  async delete(name: string) {
    await this.store.delete(name);
    this.logger.info({ name }, "Profile deleted");
  }
}
