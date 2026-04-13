/**
 * S3-based session storage for Opencode state persistence
 *
 * Saves/restores ~/.local/share/opencode (SQLite DB, auth, tool outputs)
 * so sessions survive container restarts.
 */
import * as os from "node:os";
import * as path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { downloadDirFromS3, uploadDirToS3 } from "@/lib/s3-tarball";

export interface OpencodeChimpState {
  sessionId: string | null;
  workingDir: string;
}

// ~/.local/share/opencode — opencode's data directory (SQLite, auth, etc.)
const OPENCODE_DATA_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
);

/**
 * Save opencode data directory to S3 as tarball.
 * @returns The s3:// URL of the uploaded tarball
 */
export async function saveOpencodeStateToS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<string> {
  return uploadDirToS3(
    s3Client,
    bucket,
    `${chimpName}/opencode.tar.gz`,
    path.dirname(OPENCODE_DATA_DIR),
    path.basename(OPENCODE_DATA_DIR),
    `chimp-oc-${chimpName}`,
  );
}

/**
 * Restore opencode data directory from S3 tarball.
 */
export async function restoreOpencodeStateFromS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<void> {
  return downloadDirFromS3(
    s3Client,
    bucket,
    `${chimpName}/opencode.tar.gz`,
    path.dirname(OPENCODE_DATA_DIR),
    `chimp-oc-${chimpName}`,
  );
}

/**
 * Save OpencodeBrain metadata to S3
 */
export async function saveOpencodeChimpStateToS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
  state: OpencodeChimpState,
): Promise<void> {
  const key = `${chimpName}/opencode-chimp-state.json`;

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
 * Restore OpencodeBrain metadata from S3.
 * Returns null if no state found.
 */
export async function restoreOpencodeChimpStateFromS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<OpencodeChimpState | null> {
  const key = `${chimpName}/opencode-chimp-state.json`;

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
    return JSON.parse(text) as OpencodeChimpState;
  } catch {
    return null;
  }
}
