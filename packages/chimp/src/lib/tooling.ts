import type * as Logger from "@mnke/circus-shared/logger";
import { createAppAuth } from "@octokit/auth-app";

export interface CloneResult {
  repoPath: string;
  branch: string;
}

export async function cloneRepo(
  url: string,
  targetPath?: string,
  branch?: string,
): Promise<CloneResult> {
  const repoPath =
    targetPath || url.split("/").pop()?.replace(".git", "") || "repo";
  const gitArgs = ["clone"];

  if (branch) {
    gitArgs.push("--branch", branch);
  }

  gitArgs.push(url, repoPath);

  const proc = Bun.spawn(["git", ...gitArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Git clone failed: ${stderr}`);
  }

  const branchProc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoPath,
    stdout: "pipe",
  });

  const actualBranch = (await new Response(branchProc.stdout).text()).trim();

  return { repoPath, branch: actualBranch };
}

export async function ghCloneRepo(
  repo: string,
  targetPath?: string,
  branch?: string,
): Promise<CloneResult> {
  const repoPath = targetPath || repo.split("/").pop() || "repo";
  const ghArgs = ["repo", "clone", repo];

  if (targetPath) {
    ghArgs.push(targetPath);
  }

  if (branch) {
    ghArgs.push("--", "--branch", branch);
  }

  const proc = Bun.spawn(["gh", ...ghArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`gh repo clone failed: ${stderr}`);
  }

  const branchProc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: repoPath,
    stdout: "pipe",
  });

  const actualBranch = (await new Response(branchProc.stdout).text()).trim();

  return { repoPath, branch: actualBranch };
}

export async function setupGithubAuth(logger: Logger.Logger): Promise<void> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY;
  const installationId = process.env.GITHUB_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "setup-github-auth requires GITHUB_APP_ID, GITHUB_PRIVATE_KEY, and GITHUB_INSTALLATION_ID env vars",
    );
  }

  const auth = createAppAuth({ appId, privateKey });
  const { token } = await auth({
    type: "installation",
    installationId: Number(installationId),
  });

  logger.info("Fetched GitHub installation token");

  const ghAuthProc = Bun.spawn(["gh", "auth", "login", "--with-token"], {
    stdin: "pipe",
  });
  ghAuthProc.stdin.write(token);
  ghAuthProc.stdin.end();
  await ghAuthProc.exited;
  logger.info("Configured gh CLI auth");

  await Bun.$`git config --global url.${`https://x-access-token:${token}@github.com/`}.insteadOf https://github.com/`.quiet();
  logger.info("Configured git credential helper");
}
