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
