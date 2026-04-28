import { Elysia } from "elysia";
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
    .get("/healthz", () => "OK")
    .use(chimpsController(deps))
    .use(topicsController(deps))
    .use(profilesController(deps))
    .use(messagesController(deps))
    .use(activityController(deps));

export type App = ReturnType<typeof buildApp>;
