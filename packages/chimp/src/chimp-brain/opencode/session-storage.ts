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

export interface OpencodeChimpState {
  sessionId: string | null;
  workingDir: string;
}

const OPENCODE_DATA_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
);

/**
 * Save opencode data directory to S3 as tarball
 */
export async function saveOpencodeStateToS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<string> {
  const parentDir = path.dirname(OPENCODE_DATA_DIR);
  const dirName = path.basename(OPENCODE_DATA_DIR);
  const tempDir = path.join(os.tmpdir(), `chimp-oc-${chimpName}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "opencode.tar.gz");

  try {
    await Bun.$`mkdir -p ${tempDir}`;
    await Bun.$`tar -czf ${tarballPath} -C ${parentDir} ${dirName}`;

    const fileContent = await Bun.file(tarballPath).arrayBuffer();

    const s3Key = `${chimpName}/opencode.tar.gz`;

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
    await Bun.$`rm -rf ${tempDir}`.catch(() => {});
  }
}

/**
 * Restore opencode data directory from S3 tarball
 */
export async function restoreOpencodeStateFromS3(
  s3Client: S3Client,
  bucket: string,
  chimpName: string,
): Promise<void> {
  const parentDir = path.dirname(OPENCODE_DATA_DIR);
  const tempDir = path.join(os.tmpdir(), `chimp-oc-${chimpName}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "opencode.tar.gz");

  try {
    await Bun.$`mkdir -p ${tempDir}`;

    const key = `${chimpName}/opencode.tar.gz`;

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("Empty response from S3");
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const fileContent = Buffer.concat(chunks);

    await Bun.write(tarballPath, fileContent);
    await Bun.$`mkdir -p ${parentDir}`;
    await Bun.$`tar -xzf ${tarballPath} -C ${parentDir}`;
  } finally {
    await Bun.$`rm -rf ${tempDir}`.catch(() => {});
  }
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
