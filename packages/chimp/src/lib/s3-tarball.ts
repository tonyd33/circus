/**
 * Shared S3 tarball upload/download helpers.
 *
 * Both claude and opencode session-storage use the same pattern:
 *   tar a local directory → upload to S3
 *   download from S3 → extract to local directory
 *
 * Callers supply paths; this module owns the temp dir lifecycle.
 */
import * as os from "node:os";
import * as path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export async function uploadDirToS3(
  s3Client: S3Client,
  bucket: string,
  s3Key: string,
  baseDir: string,
  dirName: string,
  tempPrefix: string,
): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `${tempPrefix}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "archive.tar.gz");

  try {
    await Bun.$`mkdir -p ${tempDir}`;
    await Bun.$`tar -czf ${tarballPath} -C ${baseDir} ${dirName}`;

    const fileContent = await Bun.file(tarballPath).arrayBuffer();

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

export async function downloadDirFromS3(
  s3Client: S3Client,
  bucket: string,
  s3Key: string,
  extractTo: string,
  tempPrefix: string,
): Promise<void> {
  const tempDir = path.join(os.tmpdir(), `${tempPrefix}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "archive.tar.gz");

  try {
    await Bun.$`mkdir -p ${tempDir}`;

    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
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
    await Bun.$`mkdir -p ${extractTo}`;
    await Bun.$`tar -xzf ${tarballPath} -C ${extractTo}`;
  } finally {
    await Bun.$`rm -rf ${tempDir}`.catch(() => {});
  }
}
