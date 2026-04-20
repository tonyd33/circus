import type { Logger } from "@mnke/circus-shared";
import { createAppAuth } from "@octokit/auth-app";

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
