import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { downloadDirFromS3, type S3Client, uploadDirToS3 } from "@/lib/s3";

export const OpencodeChimpStateSchema = z.object({
  sessionId: z.string().nullable(),
  workingDir: z.string(),
  model: z.string(),
  allowedTools: z.array(z.string()),
});
export type OpencodeChimpState = z.infer<typeof OpencodeChimpStateSchema>;

const OPENCODE_DATA_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
);

export async function saveOpencodeStateToS3(
  client: S3Client,
  chimpName: string,
): Promise<string> {
  return uploadDirToS3(
    client,
    `${chimpName}/opencode.tar.gz`,
    path.dirname(OPENCODE_DATA_DIR),
    path.basename(OPENCODE_DATA_DIR),
    `chimp-oc-${chimpName}`,
  );
}

export async function restoreOpencodeStateFromS3(
  client: S3Client,
  chimpName: string,
): Promise<void> {
  return downloadDirFromS3(
    client,
    `${chimpName}/opencode.tar.gz`,
    path.dirname(OPENCODE_DATA_DIR),
    `chimp-oc-${chimpName}`,
  );
}

export async function saveOpencodeChimpStateToS3(
  client: S3Client,
  chimpName: string,
  state: OpencodeChimpState,
): Promise<void> {
  const key = `${chimpName}/opencode-chimp-state.json`;
  await client.write(key, JSON.stringify(state), {
    type: "application/json",
  });
}

export async function restoreOpencodeChimpStateFromS3(
  client: S3Client,
  chimpName: string,
): Promise<OpencodeChimpState | null> {
  const key = `${chimpName}/opencode-chimp-state.json`;

  try {
    const text = await client.file(key).text();
    const parsed = OpencodeChimpStateSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
