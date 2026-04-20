import { type Logger, type Protocol, Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { App } from "@octokit/app";
import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { verify } from "@octokit/webhooks-methods";
import type { Adapter, AdapterResponse } from "./types";

type IssueCommentCreated = EmitterWebhookEvent<"issue_comment.created">;
type PRReviewCommentCreated =
  EmitterWebhookEvent<"pull_request_review_comment.created">;
type IssuesOpened = EmitterWebhookEvent<"issues.opened">;

const OK: AdapterResponse = {
  result: null,
  response: new Response("ok", { status: 200 }),
};

export class GitHubAdapter implements Adapter {
  private botName: string;
  private profile: string;
  private webhookSecret: string | null;
  private app: App;
  private logger: Logger.Logger;

  constructor(logger: Logger.Logger) {
    this.logger = logger;

    const result = ER.record({
      botName: ER.str("GITHUB_BOT_NAME"),
      profile: ER.str("GITHUB_PROFILE").fallback("default"),
      webhookSecret: ER.str("GITHUB_WEBHOOK_SECRET").fallbackW(null),
      appId: ER.str("GITHUB_APP_ID"),
      privateKey: ER.str("GITHUB_PRIVATE_KEY"),
    }).read(process.env).value;

    if (Either.isLeft(result)) {
      throw new Error(ER.formatReadError(result.value));
    }

    this.botName = result.value.botName;
    this.profile = result.value.profile;
    this.webhookSecret = result.value.webhookSecret;
    this.app = new App({
      appId: result.value.appId,
      privateKey: result.value.privateKey,
    });
  }

  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    if (this.webhookSecret) {
      const signature = headers["x-hub-signature-256"];
      if (!signature) {
        this.logger.warn("Missing webhook signature");
        return OK;
      }
      const valid = await verify(
        this.webhookSecret,
        JSON.stringify(body),
        signature,
      );
      if (!valid) {
        this.logger.warn("Invalid webhook signature");
        return OK;
      }
    }

    const eventType = headers["x-github-event"];

    switch (eventType) {
      case "issue_comment":
        return this.handleIssueComment(body as IssueCommentCreated["payload"]);
      case "pull_request_review_comment":
        return this.handlePRReviewComment(
          body as PRReviewCommentCreated["payload"],
        );
      case "issues":
        return this.handleIssues(body as IssuesOpened["payload"]);
      default:
        return OK;
    }
  }

  private handleIssueComment(
    payload: IssueCommentCreated["payload"],
  ): AdapterResponse {
    if (payload.action !== "created") return OK;

    const mention = `@${this.botName}`;
    if (!payload.comment.body.includes(mention)) return OK;

    const repo = payload.repository.full_name;
    const issueNumber = payload.issue.number;
    const isPR = payload.issue.pull_request != null;
    const author = payload.comment.user?.login ?? "unknown";
    const prompt = payload.comment.body.replace(mention, "").trim();
    const installationId = payload.installation?.id;

    const parts = repo.split("/");
    const owner = parts[0] ?? "";
    const repoName = parts[1] ?? "";
    const type = isPR ? "pr" : "issue";

    this.logger.info(
      { repo, issueNumber, isPR, author },
      "GitHub issue comment received",
    );

    if (installationId) {
      this.reactToComment(repo, payload.comment.id, installationId);
    }

    return this.buildResult(
      `${Standards.Chimp.Prefix.EVENTS}.github.${owner}.${repoName}.${type}.${issueNumber}.comment`,
      repo,
      installationId,
      {
        name: "issue_comment.created",
        issueNumber,
        isPR,
        commentId: payload.comment.id,
        author,
      },
      [
        `GitHub ${isPR ? "PR" : "issue"} #${issueNumber} on ${repo}`,
        `Comment by @${author}:`,
        prompt,
      ],
    );
  }

  private handlePRReviewComment(
    payload: PRReviewCommentCreated["payload"],
  ): AdapterResponse {
    if (payload.action !== "created") return OK;

    const mention = `@${this.botName}`;
    if (!payload.comment.body.includes(mention)) return OK;

    const repo = payload.repository.full_name;
    const prNumber = payload.pull_request.number;
    const author = payload.comment.user?.login ?? "unknown";
    const prompt = payload.comment.body.replace(mention, "").trim();
    const installationId = payload.installation?.id;
    const filePath = payload.comment.path;
    const diffHunk = payload.comment.diff_hunk;

    const parts = repo.split("/");
    const owner = parts[0] ?? "";
    const repoName = parts[1] ?? "";

    this.logger.info(
      { repo, prNumber, author, filePath },
      "GitHub PR review comment received",
    );

    if (installationId) {
      this.reactToComment(repo, payload.comment.id, installationId);
    }

    return this.buildResult(
      `${Standards.Chimp.Prefix.EVENTS}.github.${owner}.${repoName}.pr.${prNumber}.review_comment`,
      repo,
      installationId,
      {
        name: "pull_request_review_comment.created",
        prNumber,
        commentId: payload.comment.id,
        author,
        filePath,
      },
      [
        `GitHub PR #${prNumber} on ${repo}`,
        `Review comment by @${author} on ${filePath}:`,
        `\`\`\`diff\n${diffHunk}\n\`\`\``,
        prompt,
      ],
    );
  }

  private handleIssues(payload: IssuesOpened["payload"]): AdapterResponse {
    if (payload.action !== "opened") return OK;

    const mention = `@${this.botName}`;
    const body = payload.issue.body ?? "";
    if (!body.includes(mention)) return OK;

    const repo = payload.repository.full_name;
    const issueNumber = payload.issue.number;
    const author = payload.issue.user?.login ?? "unknown";
    const title = payload.issue.title;
    const prompt = body.replace(mention, "").trim();
    const installationId = payload.installation?.id;

    const parts = repo.split("/");
    const owner = parts[0] ?? "";
    const repoName = parts[1] ?? "";

    this.logger.info({ repo, issueNumber, author }, "GitHub issue opened");

    if (installationId) {
      this.reactToIssue(repo, issueNumber, installationId);
    }

    return this.buildResult(
      `${Standards.Chimp.Prefix.EVENTS}.github.${owner}.${repoName}.issue.${issueNumber}.opened`,
      repo,
      installationId,
      {
        name: "issues.opened",
        issueNumber,
        author,
        title,
      },
      [
        `GitHub issue #${issueNumber} on ${repo}`,
        `Opened by @${author}: ${title}`,
        prompt,
      ],
    );
  }

  private reactToComment(
    repo: string,
    commentId: number,
    installationId: number,
  ): void {
    const parts = repo.split("/");
    const owner = parts[0] ?? "";
    const repoName = parts[1] ?? "";

    this.app
      .getInstallationOctokit(installationId)
      .then((octokit) =>
        octokit.request(
          "POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
          {
            owner,
            repo: repoName,
            comment_id: commentId,
            content: "eyes",
          },
        ),
      )
      .catch((err) => {
        this.logger.error(
          { err, repo, commentId },
          "Failed to react to comment",
        );
      });
  }

  private reactToIssue(
    repo: string,
    issueNumber: number,
    installationId: number,
  ): void {
    const parts = repo.split("/");
    const owner = parts[0] ?? "";
    const repoName = parts[1] ?? "";

    this.app
      .getInstallationOctokit(installationId)
      .then((octokit) =>
        octokit.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/reactions",
          {
            owner,
            repo: repoName,
            issue_number: issueNumber,
            content: "eyes",
          },
        ),
      )
      .catch((err) => {
        this.logger.error(
          { err, repo, issueNumber },
          "Failed to react to issue",
        );
      });
  }

  private buildResult(
    eventSubject: string,
    repo: string,
    installationId: number | undefined,
    event: Protocol.GithubEvent,
    promptParts: string[],
  ): AdapterResponse {
    return {
      result: {
        eventSubject,
        defaultProfile: this.profile,
        command: {
          command: "send-agent-message",
          args: {
            prompt: promptParts.join("\n"),
            context: {
              source: "github" as const,
              repo,
              ...(installationId !== undefined && { installationId }),
              event,
            },
          },
        },
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
