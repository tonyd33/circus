import { access, readFile } from "node:fs/promises";
import type { Logger, Protocol } from "@mnke/circus-shared";
import { ProfileCompiler, type ProfileStore } from "@mnke/circus-shared/lib";

export class ProfileLoader {
  private store: ProfileStore;
  private logger: Logger.Logger;
  private templatePath: string | undefined;

  constructor(
    store: ProfileStore,
    logger: Logger.Logger,
    templatePath?: string,
  ) {
    this.store = store;
    this.logger = logger;
    this.templatePath = templatePath;
  }

  async seedDefaults(): Promise<void> {
    const profiles = await this.loadFromTemplate();
    if (!profiles || Object.keys(profiles).length === 0) {
      this.logger.warn("No profiles to seed");
      return;
    }

    const seeded = await this.store.seedDefaults(profiles);
    if (seeded) {
      this.logger.info(
        { profiles: Object.keys(profiles) },
        "Seeded profiles from template",
      );
    }
  }

  private async loadFromTemplate(): Promise<Record<
    string,
    Protocol.ChimpProfile
  > | null> {
    if (!this.templatePath) return null;

    try {
      await access(this.templatePath);
    } catch {
      this.logger.warn(
        { path: this.templatePath },
        "Profile template file not found",
      );
      return null;
    }

    try {
      const raw = await readFile(this.templatePath, "utf-8");
      const template: ProfileCompiler.ProfileTemplate = JSON.parse(raw);
      return ProfileCompiler.compileProfiles(template);
    } catch (err) {
      this.logger.error(
        { err, path: this.templatePath },
        "Failed to compile profile template",
      );
      return null;
    }
  }

  async getProfile(name: string): Promise<Protocol.ChimpProfile> {
    const profile = await this.store.get(name);
    if (!profile) {
      throw new Error(`Profile "${name}" not found`);
    }
    return profile;
  }

  async stop(): Promise<void> {}
}
