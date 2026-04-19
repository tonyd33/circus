/**
 * Ringmaster - Profile Loader
 *
 * Loads chimp profiles from file system only (no K8s).
 */

import { type Logger, Protocol } from "@mnke/circus-shared";

type ProfilesFile = Record<string, Protocol.ChimpProfile>;

export class ProfileLoader {
  private profiles: Map<string, Protocol.ChimpProfile> = new Map();
  private logger: Logger.Logger;

  constructor(logger: Logger.Logger) {
    this.logger = logger;
  }

  /**
   * Set default profile when no config file available.
   */
  private setDefault(): void {
    this.profiles.set("default", {
      brain: "claude",
      model: "haiku-4-5",
      image: "circus-chimp",
    });
    this.logger.info("Using default profile");
  }

  /**
   * Load profiles from file.
   *
   * @param filePath - Required path to profiles JSON file
   *
   * Parses file with ChimpProfileSchema.parse() - throws on invalid.
   * Falls back to default profile on any error.
   */
  async load(filePath: string): Promise<void> {
    try {
      const content = await Bun.file(filePath).text();
      const raw = JSON.parse(content) as ProfilesFile;

      let validCount = 0;
      for (const [name, profile] of Object.entries(raw)) {
        const parsed = Protocol.ChimpProfileSchema.parse(profile);
        this.profiles.set(name, parsed);
        validCount++;
        this.logger.debug({ name, profile: parsed }, "Loaded profile");
      }

      if (validCount === 0) {
        this.logger.warn("No valid profiles found in file, using default");
        this.setDefault();
        return;
      }

      this.logger.info({ count: this.profiles.size }, "Profiles loaded");
    } catch (error) {
      this.logger.warn(
        { error, filePath },
        "Failed to load profiles, using default",
      );
      this.setDefault();
    }
  }

  /**
   * Get a profile by name.
   */
  getProfile(name: string): Protocol.ChimpProfile {
    const profile = this.profiles.get(name);
    if (profile == null) {
      throw new Error("Unknown profile");
    } else {
      return profile;
    }
  }

  /**
   * Get all profile names.
   */
  getProfileNames(): string[] {
    return Array.from(this.profiles.keys());
  }

  /**
   * Check if profile exists.
   */
  hasProfile(name: string): boolean {
    return this.profiles.has(name);
  }
}

/**
 * Create profile loader and load profiles.
 *
 * @param filePath - Required path to profiles JSON file
 */
export async function createProfileLoader(
  filePath: string,
  logger: Logger.Logger,
): Promise<ProfileLoader> {
  const loader = new ProfileLoader(logger);
  await loader.load(filePath);
  return loader;
}
