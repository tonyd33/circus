/**
 * S3-based session storage for Claude state persistence
 */
import * as os from "node:os";
import * as path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { downloadDirFromS3, uploadDirToS3 } from "@/lib/s3-tarball";

export interface ClaudeChimpState {
  sessionId: string | undefined;
  workingDir: string;
  messageCount: number;
  model: string;
  allowedTools: string[];
}

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
 * Save the entire Claude state directory to S3 as a tarball.
 * @returns The S3 path where the state was saved
 */
export async function saveClaudeStateToS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<string> {
  return uploadDirToS3(
    s3Client,
    bucket,
    `${chimpName}/claude.tar.gz`,
    os.homedir(),
    ".claude",
    `chimp-claude-${chimpName}`,
  );
}

/**
 * Restore the entire Claude state directory from S3 tarball.
 */
export async function restoreClaudeStateFromS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<void> {
  return downloadDirFromS3(
    s3Client,
    bucket,
    `${chimpName}/claude.tar.gz`,
    os.homedir(),
    `chimp-claude-${chimpName}`,
  );
}

/**
 * Save ClaudeChimp metadata to S3 as JSON
 */
export async function saveChimpStateToS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
  state: ClaudeChimpState,
): Promise<void> {
  const key = `${chimpName}/chimp-state.json`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode(JSON.stringify(state)),
      ContentType: "application/json",
    }),
  );
}

/**
 * Restore ClaudeChimp metadata from S3 JSON.
 * Returns null if no state found (first run).
 */
export async function restoreChimpStateFromS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<ClaudeChimpState | null> {
  const key = `${chimpName}/chimp-state.json`;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) return null;

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(text) as ClaudeChimpState;
  } catch {
    return null;
  }
}
