import type { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { verify } from "@octokit/webhooks-methods";
import type { Adapter, AdapterResponse } from "./types";

interface IssueCommentPayload {
  action: string;
  comment: {
    id: number;
    body: string;
    user: { login: string };
  };
  issue: {
    number: number;
    pull_request?: { url: string };
  };
  repository: {
    full_name: string;
  };
}

export class GitHubAdapter implements Adapter {
  private botName: string;
  private profile: string;
  private webhookSecret: string | null;
  private logger: Logger.Logger;

  constructor(logger: Logger.Logger) {
    this.logger = logger;

    const result = ER.record({
      botName: ER.str("GITHUB_BOT_NAME"),
      profile: ER.str("GITHUB_PROFILE").fallback("default"),
      webhookSecret: ER.str("GITHUB_WEBHOOK_SECRET").fallbackW(null),
    }).read(process.env).value;

    if (Either.isLeft(result)) {
      throw new Error(ER.formatReadError(result.value));
    }

    this.botName = result.value.botName;
    this.profile = result.value.profile;
    this.webhookSecret = result.value.webhookSecret;
  }

  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    const ok = { result: null, response: new Response("ok", { status: 200 }) };

    if (this.webhookSecret) {
      const signature = headers["x-hub-signature-256"];
      if (!signature) {
        this.logger.warn("Missing webhook signature");
        return ok;
      }
      const valid = await verify(
        this.webhookSecret,
        JSON.stringify(body),
        signature,
      );
      if (!valid) {
        this.logger.warn("Invalid webhook signature");
        return ok;
      }
    }

    const payload = body as IssueCommentPayload;

    if (payload.action !== "created") return ok;
    if (!payload.comment?.body) return ok;

    const mention = `@${this.botName}`;
    if (!payload.comment.body.includes(mention)) return ok;

    const repo = payload.repository.full_name;
    const issueNumber = payload.issue.number;
    const isPR = payload.issue.pull_request != null;
    const author = payload.comment.user.login;
    const prompt = payload.comment.body.replace(mention, "").trim();

    const chimpId = `gh-${repo.replace("/", "-")}-${isPR ? "pr" : "issue"}-${issueNumber}`;

    this.logger.info(
      { repo, issueNumber, isPR, author, chimpId },
      "GitHub comment received",
    );

    return {
      result: {
        profile: this.profile,
        chimpId,
        command: {
          command: "send-agent-message",
          args: {
            prompt: [
              `GitHub ${isPR ? "PR" : "issue"} #${issueNumber} on ${repo}`,
              `Comment by @${author}:`,
              prompt,
            ].join("\n"),
            context: {
              source: "github",
              repo,
              issueNumber,
              commentId: payload.comment.id,
            },
          },
        },
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
