import type { Protocol } from "@mnke/circus-shared";
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

  async save(name: string, profile: Protocol.ChimpProfile): Promise<void> {
    await this.store.save(name, profile);
    this.logger.info({ name }, "Profile saved");
  }

  async delete(name: string) {
    await this.store.delete(name);
    this.logger.info({ name }, "Profile deleted");
  }
}
