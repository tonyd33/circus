import type { ProfileService } from "../services/profile-service";

export class ProfileRouter {
  constructor(private profileService: ProfileService) {}

  get routes() {
    return {
      "/api/profiles": {
        GET: async () => {
          const profiles = await this.profileService.list();
          return Response.json({ profiles });
        },
      },
      "/api/profiles/:name": {
        GET: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) return new Response("Missing name", { status: 400 });

          const profile = await this.profileService.get(name);
          if (!profile)
            return Response.json({ error: "Not found" }, { status: 404 });

          return Response.json({ name, profile });
        },
        PUT: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) return new Response("Missing name", { status: 400 });

          const body = await req.json().catch(() => null);
          const result = await this.profileService.save(name, body);
          if ("error" in result) {
            return Response.json({ error: result.error }, { status: 400 });
          }
          return Response.json({ ok: true });
        },
        DELETE: async (
          req: Bun.BunRequest<"/api/profiles/:name">,
        ): Promise<Response> => {
          const name = req.params.name;
          if (!name) return new Response("Missing name", { status: 400 });

          await this.profileService.delete(name);
          return Response.json({ ok: true });
        },
      },
    };
  }
}
