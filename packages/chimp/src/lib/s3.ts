import * as os from "node:os";
import * as path from "node:path";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { S3Client } from "bun";

export type { S3Client };

export interface Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const configReader: ER.EnvReader<Config> = ER.record({
  endpoint: ER.str("S3_ENDPOINT").fallback("http://minio:9000"),
  region: ER.str("S3_REGION").fallback("us-east-1"),
  accessKeyId: ER.str("S3_ACCESS_KEY_ID").fallback("minioadmin"),
  secretAccessKey: ER.str("S3_SECRET_ACCESS_KEY").fallback("minioadmin"),
  bucket: ER.str("S3_BUCKET").fallback("circus"),
});

export function createS3Client(config: Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucket: config.bucket,
  });
}

export async function uploadDirToS3(
  client: S3Client,
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
    await client.write(s3Key, new Uint8Array(fileContent), {
      type: "application/gzip",
    });

    return s3Key;
  } finally {
    await Bun.$`rm -rf ${tempDir}`.catch(() => {});
  }
}

export async function downloadDirFromS3(
  client: S3Client,
  s3Key: string,
  extractTo: string,
  tempPrefix: string,
): Promise<void> {
  const tempDir = path.join(os.tmpdir(), `${tempPrefix}-${Date.now()}`);
  const tarballPath = path.join(tempDir, "archive.tar.gz");

  try {
    await Bun.$`mkdir -p ${tempDir}`;

    const data = await client.file(s3Key).arrayBuffer();
    await Bun.write(tarballPath, data);

    await Bun.$`mkdir -p ${extractTo}`;
    await Bun.$`tar -xzf ${tarballPath} -C ${extractTo}`;
  } finally {
    await Bun.$`rm -rf ${tempDir}`.catch(() => {});
  }
}
