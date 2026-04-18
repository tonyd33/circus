/**
 * Ringmaster - Profile Loader
 *
 * Loads chimp profiles from file system only (no K8s).
 */

import { Logger, Protocol } from "@mnke/circus-shared";

const logger = Logger.createLogger("ProfileLoader");

/**
 * Profiles file format: { [name: string]: ChimpProfile }
 */
type ProfilesFile = Record<string, Protocol.ChimpProfile>;

export class ProfileLoader {
  private profiles: Map<string, Protocol.ChimpProfile> = new Map();

  constructor() {}

  /**
   * Set default profile when no config file available.
   */
  private setDefault(): void {
    this.profiles.set("default", {
      brain: "claude",
      model: "haiku-4-5",
    });
    logger.info("Using default profile");
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
        logger.debug({ name, profile: parsed }, "Loaded profile");
      }

      if (validCount === 0) {
        logger.warn("No valid profiles found in file, using default");
        this.setDefault();
        return;
      }

      logger.info({ count: this.profiles.size }, "Profiles loaded");
    } catch (error) {
      logger.warn(
        { error, filePath },
        "Failed to load profiles, using default",
      );
      this.setDefault();
    }
  }

  /**
   * Get a profile by name.
   */
  getProfile(name: string): Protocol.ChimpProfile | undefined {
    return this.profiles.get(name);
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
): Promise<ProfileLoader> {
  const loader = new ProfileLoader();
  await loader.load(filePath);
  return loader;
}
