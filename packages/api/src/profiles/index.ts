import { Elysia, t } from "elysia";
import type { Deps } from "../deps";

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
      { params: t.Object({ name: t.String() }) },
    )
    .put(
      "/:name",
      async ({ params, body, status }) => {
        const result = await deps.profileService.save(params.name, body);
        if ("error" in result) return status(400, { error: result.error });
        return { ok: true };
      },
      {
        params: t.Object({ name: t.String() }),
        body: t.Unknown(),
      },
    )
    .delete(
      "/:name",
      async ({ params }) => {
        await deps.profileService.delete(params.name);
        return { ok: true };
      },
      { params: t.Object({ name: t.String() }) },
    );
