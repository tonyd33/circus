import { Protocol } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";

const NameParams = z.object({ name: z.string().min(1) });
const ErrorBody = z.object({ error: z.string() });
const OkBody = z.object({ ok: z.literal(true) });

export const profilesController = (deps: Deps) =>
  new Elysia({ prefix: "/api/profiles", name: "profiles" })
    .get("/", async () => ({ profiles: await deps.profileService.list() }), {
      response: z.object({
        profiles: z.record(z.string(), Protocol.ChimpProfileSchema),
      }),
      detail: { tags: ["profiles"], summary: "List all profile definitions" },
    })
    .get(
      "/:name",
      async ({ params, status }) => {
        const profile = await deps.profileService.get(params.name);
        if (!profile) return status(404, { error: "Not found" });
        return { name: params.name, profile };
      },
      {
        params: NameParams,
        response: {
          200: z.object({
            name: z.string(),
            profile: Protocol.ChimpProfileSchema,
          }),
          404: ErrorBody,
        },
        detail: { tags: ["profiles"], summary: "Get a profile definition" },
      },
    )
    .put(
      "/:name",
      async ({ params, body }) => {
        await deps.profileService.save(params.name, body);
        return { ok: true as const };
      },
      {
        params: NameParams,
        body: Protocol.ChimpProfileSchema,
        response: OkBody,
        detail: {
          tags: ["profiles"],
          summary: "Create or replace a profile definition",
        },
      },
    )
    .delete(
      "/:name",
      async ({ params }) => {
        await deps.profileService.delete(params.name);
        return { ok: true as const };
      },
      {
        params: NameParams,
        response: OkBody,
        detail: { tags: ["profiles"], summary: "Delete a profile definition" },
      },
    );
