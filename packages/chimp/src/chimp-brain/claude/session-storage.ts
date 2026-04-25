import * as os from "node:os";
import * as path from "node:path";
import { Protocol } from "@mnke/circus-shared";
import { z } from "zod";
import type { S3Client } from "@/lib/s3";
import { downloadDirFromS3, uploadDirToS3 } from "@/lib/s3";

export type { StoredEventContext } from "@/chimp-brain/event-contexts";

export const ClaudeChimpStateSchema = z.object({
  sessionId: z.string().optional(),
  workingDir: z.string(),
  messageCount: z.number(),
  model: z.string(),
  allowedTools: z.array(z.string()),
  eventContexts: z.array(Protocol.StoredEventContextSchema).default([]),
});
export type ClaudeChimpState = z.infer<typeof ClaudeChimpStateSchema>;

export function getSessionFilePath(
  workingDir: string,
  sessionId: string,
): string {
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, ".claude", "projects");
  const encodedCwd = workingDir.replace(/[^a-zA-Z0-9]/g, "-");
  return path.join(claudeDir, encodedCwd, `${sessionId}.jsonl`);
}

export async function saveClaudeStateToS3(
  client: S3Client,
  chimpName: string,
): Promise<string> {
  return uploadDirToS3(
    client,
    `${chimpName}/claude.tar.gz`,
    os.homedir(),
    ".claude",
    `chimp-claude-${chimpName}`,
  );
}

export async function restoreClaudeStateFromS3(
  client: S3Client,
  chimpName: string,
): Promise<void> {
  return downloadDirFromS3(
    client,
    `${chimpName}/claude.tar.gz`,
    os.homedir(),
    `chimp-claude-${chimpName}`,
  );
}

export async function saveChimpStateToS3(
  client: S3Client,
  chimpName: string,
  state: ClaudeChimpState,
): Promise<void> {
  const key = `${chimpName}/chimp-state.json`;
  await client.write(key, JSON.stringify(state), {
    type: "application/json",
  });
}

export async function restoreChimpStateFromS3(
  client: S3Client,
  chimpName: string,
): Promise<ClaudeChimpState | null> {
  const key = `${chimpName}/chimp-state.json`;

  try {
    const text = await client.file(key).text();
    const parsed = ClaudeChimpStateSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
