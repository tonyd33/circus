import { Protocol } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";

const NameParams = z.object({ name: z.string().min(1) });

export const profilesController = (deps: Deps) =>
  new Elysia({ prefix: "/api/profiles", name: "profiles" })
    .get("/", async () => ({ profiles: await deps.profileService.list() }))
    .get(
      "/:name",
      async ({ params, status }) => {
        const profile = await deps.profileService.get(params.name);
        if (!profile) return status(404, { error: "Not found" });
        return { name: params.name, profile };
      },
      { params: NameParams },
    )
    .put(
      "/:name",
      async ({ params, body }) => {
        await deps.profileService.save(params.name, body);
        return { ok: true };
      },
      { params: NameParams, body: Protocol.ChimpProfileSchema },
    )
    .delete(
      "/:name",
      async ({ params }) => {
        await deps.profileService.delete(params.name);
        return { ok: true };
      },
      { params: NameParams },
    );
