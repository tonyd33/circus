/**
 * S3-based session storage for Claude state persistence
 */
import * as os from "node:os";
import * as path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createLogger } from "@mnke/circus-shared/logger";
import type { AppState } from "./types";

const logger = createLogger("Chimp");

/**
 * Initialize S3 client from environment variables
 */
export function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT || "http://minio:9000";
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for MinIO
  });
}

/**
 * Get the session file path for a given working directory and session ID
 * Format: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 * where <encoded-cwd> is the absolute working directory with every
 * non-alphanumeric character replaced by -
 */
export function getSessionFilePath(
  workingDir: string,
  sessionId: string,
): string {
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, ".claude", "projects");

  // Encode the working directory path by replacing non-alphanumeric chars with -
  // e.g., /Users/me/proj becomes -Users-me-proj
  const encodedCwd = workingDir.replace(/[^a-zA-Z0-9]/g, "-");

  const sessionFile = path.join(claudeDir, encodedCwd, `${sessionId}.jsonl`);
  return sessionFile;
}

/**
 * Save the entire Claude state directory to S3 as a tarball
 * @returns The S3 path where the state was saved
 */
export async function saveClaudeStateToS3(chimpName: string): Promise<string> {
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, ".claude");
  const tempDir = path.join(os.tmpdir(), `chimp-${chimpName}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "claude.tar.gz");

  try {
    // Create temp directory
    await Bun.$`mkdir -p ${tempDir}`;

    // Create tarball of ~/.claude directory
    // Use -C to change to home directory, then tar the .claude directory
    await Bun.$`tar -czf ${tarballPath} -C ${homeDir} .claude`;

    // Read the tarball
    const fileContent = await Bun.file(tarballPath).arrayBuffer();

    // Upload to S3
    const s3Client = createS3Client();
    const bucket = process.env.S3_BUCKET || "claude-sessions";
    const s3Key = `${chimpName}/claude.tar.gz`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: new Uint8Array(fileContent),
        ContentType: "application/gzip",
      }),
    );

    return `s3://${bucket}/${s3Key}`;
  } finally {
    // Clean up temp directory
    await Bun.$`rm -rf ${tempDir}`.catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Restore the entire Claude state directory from S3 tarball
 */
export async function restoreClaudeStateFromS3(
  chimpName: string,
): Promise<void> {
  const homeDir = os.homedir();
  const tempDir = path.join(os.tmpdir(), `chimp-${chimpName}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "claude.tar.gz");

  try {
    // Create temp directory
    await Bun.$`mkdir -p ${tempDir}`;

    // Download from S3
    const s3Client = createS3Client();
    const bucket = process.env.S3_BUCKET || "claude-sessions";
    const key = `${chimpName}/claude.tar.gz`;

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("Empty response from S3");
    }

    // Read the body stream
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const fileContent = Buffer.concat(chunks);

    // Write tarball to temp file
    await Bun.write(tarballPath, fileContent);

    // Extract tarball to home directory
    // This will restore ~/.claude directory
    await Bun.$`tar -xzf ${tarballPath} -C ${homeDir}`;
  } finally {
    // Clean up temp directory
    await Bun.$`rm -rf ${tempDir}`.catch(() => {
      // Ignore cleanup errors
    });
  }
}

/**
 * Save AppState to S3 as JSON
 * @returns The S3 path where the state was saved
 */
export async function saveAppStateToS3(
  chimpName: string,
  state: AppState,
): Promise<string> {
  const s3Client = createS3Client();
  const bucket = process.env.S3_BUCKET || "claude-sessions";
  const s3Key = `${chimpName}/app-state.json`;

  const stateJson = JSON.stringify(state, null, 2);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: stateJson,
      ContentType: "application/json",
    }),
  );

  return `s3://${bucket}/${s3Key}`;
}

/**
 * Restore AppState from S3
 * @returns The restored AppState, or null if not found
 */
export async function restoreAppStateFromS3(
  chimpName: string,
): Promise<AppState | null> {
  const s3Client = createS3Client();
  const bucket = process.env.S3_BUCKET || "claude-sessions";
  const key = `${chimpName}/app-state.json`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      return null;
    }

    // Read the body stream
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const fileContent = Buffer.concat(chunks).toString("utf-8");

    const state = JSON.parse(fileContent) as AppState;
    return state;
  } catch (error) {
    // Return null if file doesn't exist
    return null;
  }
}
