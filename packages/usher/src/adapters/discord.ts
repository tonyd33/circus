import type { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import type { Adapter, AdapterResponse } from "./types";

interface DiscordInteraction {
  type: number;
  id: string;
  token: string;
  application_id: string;
  data?: {
    name: string;
    options?: Array<{ name: string; value: string; type: number }>;
  };
  member?: { user: { id: string; username: string } };
  user?: { id: string; username: string };
  guild_id?: string;
  channel_id?: string;
}

export class DiscordAdapter implements Adapter {
  private publicKey: string;
  private applicationId: string;
  private profile: string;
  private logger: Logger.Logger;

  constructor(logger: Logger.Logger) {
    this.logger = logger;

    const result = ER.record({
      publicKey: ER.str("DISCORD_PUBLIC_KEY"),
      applicationId: ER.str("DISCORD_APPLICATION_ID"),
      profile: ER.str("DISCORD_PROFILE").fallback("default"),
    }).read(process.env).value;

    if (Either.isLeft(result)) {
      throw new Error(ER.formatReadError(result.value));
    }

    this.publicKey = result.value.publicKey;
    this.applicationId = result.value.applicationId;
    this.profile = result.value.profile;
  }

  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    const signature = headers["x-signature-ed25519"];
    const timestamp = headers["x-signature-timestamp"];
    const rawBody = JSON.stringify(body);

    if (!signature || !timestamp) {
      return {
        result: null,
        response: new Response("Bad request", { status: 401 }),
      };
    }

    const isValid = await verifyKey(
      rawBody,
      signature,
      timestamp,
      this.publicKey,
    );
    if (!isValid) {
      return {
        result: null,
        response: new Response("Invalid signature", { status: 401 }),
      };
    }

    const interaction = body as DiscordInteraction;

    if (interaction.type === InteractionType.PING) {
      return {
        result: null,
        response: Response.json({ type: InteractionResponseType.PONG }),
      };
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const commandName = interaction.data?.name;
      if (commandName !== "circus") {
        return {
          result: null,
          response: Response.json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: "Unknown command" },
          }),
        };
      }

      const promptOption = interaction.data?.options?.find(
        (o) => o.name === "prompt",
      );
      const prompt = promptOption?.value ?? "";
      const user =
        interaction.member?.user?.username ??
        interaction.user?.username ??
        "unknown";
      const guild = interaction.guild_id ?? "dm";
      const channel = interaction.channel_id ?? "unknown";
      const eventSubject = `events.discord.${guild}.${channel}.message`;

      this.logger.info(
        { user, eventSubject, prompt: prompt.slice(0, 100) },
        "Discord slash command received",
      );

      return {
        result: {
          eventSubject,
          defaultProfile: this.profile,
          command: {
            command: "send-agent-message",
            args: {
              prompt: `Discord message from ${user}:\n${prompt}`,
              context: {
                source: "discord",
                interactionToken: interaction.token,
                applicationId: this.applicationId,
              },
            },
          },
        },
        response: Response.json({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        }),
      };
    }

    return {
      result: null,
      response: new Response("ok", { status: 200 }),
    };
  }
}
