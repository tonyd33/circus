/**
 * Shared configuration and validation for Circus
 *
 * Validates environment variables and provides type-safe configuration
 */

/**
 * Configuration error thrown when required environment variables are missing
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Validate required environment variables
 *
 * @param required - Array of required environment variable names
 * @throws ConfigurationError if any required variables are missing
 *
 * @example
 * validateRequiredEnv(['ANTHROPIC_API_KEY', 'NATS_URL', 'REDIS_URL']);
 */
export function validateRequiredEnv(required: string[]): void {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}

/**
 * Get an environment variable with a default value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns The environment variable value or default
 */
export function getEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get an integer environment variable with a default value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns The parsed integer value or default
 */
export function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Environment variable ${key} must be a valid integer, got: ${value}`,
    );
  }

  return parsed;
}

/**
 * Get a boolean environment variable with a default value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns The boolean value or default
 */
export function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;

  const lower = value.toLowerCase();
  if (lower === "true" || lower === "1" || lower === "yes") return true;
  if (lower === "false" || lower === "0" || lower === "no") return false;

  throw new ConfigurationError(
    `Environment variable ${key} must be a boolean (true/false), got: ${value}`,
  );
}

/**
 * Get an array environment variable (comma-separated) with a default value
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Array of trimmed values
 *
 * @example
 * // ALLOWED_TOOLS=Read,Write,Edit
 * const tools = getEnvArray('ALLOWED_TOOLS', ['Read']);
 * // returns ['Read', 'Write', 'Edit']
 */
export function getEnvArray(key: string, defaultValue: string[]): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
