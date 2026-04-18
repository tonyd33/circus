import { type Logger, Protocol } from "@mnke/circus-shared";
import { serve } from "bun";
import {
  type ActivityCallback,
  ChimpInput,
  type MessageHandler,
} from "./chimp-input";

export class HttpInput extends ChimpInput {
  private port: number;
  private handler: MessageHandler;
  private onActivity: ActivityCallback;
  private onStopRequested: () => Promise<void>;
  private server: ReturnType<typeof serve> | null = null;
  private logger: Logger.Logger;

  constructor(
    port: number,
    handler: MessageHandler,
    onActivity: ActivityCallback,
    onStopRequested: () => Promise<void>,
    logger: Logger.Logger,
  ) {
    super();
    this.port = port;
    this.handler = handler;
    this.onActivity = onActivity;
    this.onStopRequested = onStopRequested;
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.server = serve({
      port: this.port,
      routes: {
        "/command": {
          POST: async (req) => {
            this.onActivity();
            try {
              const payload = await req.json();
              const command = Protocol.parseChimpCommand(payload);

              this.processCommand(command).catch((error) => {
                this.logger.error(
                  { err: error },
                  "Error processing HTTP command",
                );
              });

              return new Response(null, { status: 202 });
            } catch (error) {
              this.logger.error({ err: error }, "Invalid command");
              return new Response(
                JSON.stringify({ error: "Invalid command" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
          },
        },
        "/health": {
          GET: () => new Response("OK"),
        },
      },
    });

    this.logger.info({ port: this.port }, "HTTP server started");
  }

  private async processCommand(
    command: ReturnType<typeof Protocol.parseChimpCommand>,
  ): Promise<void> {
    this.logger.info({ command: command.command }, "Processing HTTP command");

    try {
      const result = await this.handler(command);
      this.logger.info({ command: command.command }, "Processed HTTP command");

      if (result === "stop") {
        await this.onStopRequested();
      }
    } catch (error) {
      this.logger.error(
        { err: error, command: command.command },
        "Error processing HTTP command",
      );
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }
}
