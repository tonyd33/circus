import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type Redis from "ioredis";

const Naming = Standards.Chimp.Naming;

export class ProfileRouter {
  private redis: Redis;
  private logger: Logger.Logger;

  constructor(redis: Redis, logger: Logger.Logger) {
    this.redis = redis;
    this.logger = logger;
  }

  get routes() {
    return {
      "/api/profiles": {
        GET: async () => {
          const keys = await this.redis.keys(Naming.redisProfilePattern());
          const profiles: Record<string, Protocol.ChimpProfile> = {};

          if (keys.length > 0) {
            const pipeline = this.redis.pipeline();
            for (const key of keys) {
              pipeline.get(key);
            }
            const results = await pipeline.exec();
            if (results) {
              for (let i = 0; i < keys.length; i++) {
                const [err, data] = results[i] ?? [];
                if (!err && data) {
                  const name = keys[i]?.replace("profile:", "");
                  // IMPROVE: Better error handling
                  if (name == null) {
                    throw new Error("Bad key");
                  }
                  const parsed = Protocol.ChimpProfileSchema.safeParse(
                    JSON.parse(data as string),
                  );
                  if (parsed.success) {
                    profiles[name] = parsed.data;
                  }
                }
              }
            }
          }

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

          const data = await this.redis.get(Naming.redisProfileKey(name));
          if (!data) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }

          const parsed = Protocol.ChimpProfileSchema.safeParse(
            JSON.parse(data),
          );
          if (!parsed.success) {
            this.logger.error(
              { name, error: parsed.error.issues },
              "Corrupt profile in Redis",
            );
            return Response.json(
              { error: "Corrupt profile data" },
              { status: 500 },
            );
          }

          return Response.json({ name, profile: parsed.data });
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

          await this.redis.set(
            Naming.redisProfileKey(name),
            JSON.stringify(parsed.data),
          );
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

          const deleted = await this.redis.del(Naming.redisProfileKey(name));
          if (deleted === 0) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }

          this.logger.info({ name }, "Profile deleted");
          return Response.json({ ok: true });
        },
      },
    };
  }
}
