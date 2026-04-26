import type { AuthConfig, AuthProviderConfig } from "../protocol";
import type { TokenStore } from "./token-store";

export class AuthResolver {
  constructor(
    private authConfig: AuthConfig,
    private tokenStore: TokenStore,
  ) {}

  async resolve(provider: string): Promise<string> {
    const config = this.authConfig[provider];
    if (!config) {
      throw new Error(`Auth config missing for provider: ${provider}`);
    }

    const value = await this.resolveFromConfig(config);
    if (value == null) {
      throw new Error(`Auth value missing for provider: ${provider}`);
    }

    return value;
  }

  async resolveAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const provider of Object.keys(this.authConfig)) {
      result[provider] = await this.resolve(provider);
    }
    return result;
  }

  private async resolveFromConfig(
    config: AuthProviderConfig,
  ): Promise<string | null> {
    switch (config.source) {
      case "env":
        return process.env[config.envVar] ?? null;
      case "redis":
        return this.tokenStore.get(config.key);
    }
  }
}
