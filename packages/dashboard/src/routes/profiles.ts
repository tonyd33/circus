import { type Logger, Protocol } from "@mnke/circus-shared";
import type { ProfileStore } from "@mnke/circus-shared/services";

export class ProfileRouter {
  private store: ProfileStore;
  private logger: Logger.Logger;

  constructor(store: ProfileStore, logger: Logger.Logger) {
    this.store = store;
    this.logger = logger;
  }

  get routes() {
    return {
      "/api/profiles": {
        GET: async () => {
          const profiles = await this.store.list();
          return Response.json({ profiles });
        },
      },
      "/api/profiles/:name": {
        GET: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) {
            return new Response("Missing name", { status: 400 });
          }

          const profile = await this.store.get(name);
          if (!profile) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }

          return Response.json({ name, profile });
        },
        PUT: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) {
            return new Response("Missing name", { status: 400 });
          }

          const body = await req.json().catch(() => null);
          const parsed = Protocol.ChimpProfileSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.flatten() },
              { status: 400 },
            );
          }

          await this.store.save(name, parsed.data);
          this.logger.info({ name }, "Profile saved");
          return Response.json({ ok: true });
        },
        DELETE: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) {
            return new Response("Missing name", { status: 400 });
          }

          await this.store.delete(name);
          this.logger.info({ name }, "Profile deleted");
          return Response.json({ ok: true });
        },
      },
    };
  }
}
