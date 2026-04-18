import { S3Client } from "@aws-sdk/client-s3";
import { EnvReader as ER } from "@mnke/circus-shared/lib";

export interface S3Config {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export const s3ConfigReader = ER.record({
  endpoint: ER.str("S3_ENDPOINT").fallback("http://minio:9000"),
  region: ER.str("S3_REGION").fallback("us-east-1"),
  accessKeyId: ER.str("S3_ACCESS_KEY_ID").fallback("minioadmin"),
  secretAccessKey: ER.str("S3_SECRET_ACCESS_KEY").fallback("minioadmin"),
  bucket: ER.str("S3_BUCKET").fallback("claude-sessions"),
});

export function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}
