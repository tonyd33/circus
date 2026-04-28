import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { z } from "zod";
import { activityController } from "./activity";
import { chimpsController } from "./chimps";
import type { Deps } from "./deps";
import { messagesController } from "./messages";
import { corsPlugin } from "./plugins/cors";
import { profilesController } from "./profiles";
import { topicsController } from "./topics";

export interface AppConfig {
  dashboardOrigin: string;
}

export const buildApp = (deps: Deps, config: AppConfig) =>
  new Elysia()
    .use(corsPlugin(config.dashboardOrigin))
    .use(
      openapi({
        mapJsonSchema: { zod: z.toJSONSchema },
        exclude: { paths: ["/healthz"] },
        documentation: {
          info: {
            title: "Circus API",
            version: "0.1.0",
            description: "Internal API serving the Circus dashboard.",
          },
          tags: [
            { name: "chimps", description: "Chimp lifecycle and topics" },
            { name: "topics", description: "Topic subscriptions" },
            { name: "profiles", description: "Chimp profile definitions" },
            { name: "messages", description: "Send commands to chimps" },
          ],
        },
      }),
    )
    .onError(({ code, error, status }) => {
      if (code === "VALIDATION") {
        return status(400, {
          error: error.all[0]?.message ?? "Validation failed",
        });
      }
    })
    .get("/healthz", () => "OK")
    .use(chimpsController(deps))
    .use(topicsController(deps))
    .use(profilesController(deps))
    .use(messagesController(deps))
    .use(activityController(deps));

export type App = ReturnType<typeof buildApp>;
