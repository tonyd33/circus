# Circus Agent Guide

## Quick Commands

```sh
# Run a package
bun run packages/ringmaster/src/index.ts
bun run packages/bullhorn/src/index.ts
bun run packages/dashboard/src/index.ts

# Test
bun test

# Typecheck (all packages)
bun run --filter='*' typecheck

# Dev with hot reload
bun --watch packages/ringmaster/src/index.ts
```

## Packages

| Package | Purpose | Entry |
|---------|---------|-------|
| ringmaster | Chimp lifecycle orchestrator | `src/index.ts` |
| dashboard | Web UI (React + Bun.serve) | `src/index.ts` |
| chimp | Agent implementation | `src/index.ts` |
| usher | Event ingress adapters (GitHub, Discord) | `src/index.ts` |
| bullhorn | Output dispatchers (GitHub API, Discord API) | `src/index.ts` |
| shared | Types, standards, utils | `src/index.ts` |

## Architecture

- **Event-centric NATS subjects**: Events describe what happened in the world (`events.github.{owner}.{repo}.pr.{number}.comment`). Chimps subscribe to topics they care about. Direct commands via `commands.{chimpId}`.
- **Topic subscriptions**: Chimps register interest in topics (via MCP `subscribe_topic` tool). Postgres `topic_subscriptions` table maps topics to chimps (multiple chimps per topic). Enables cross-platform continuity (e.g. discord-triggered chimp receives github PR comments).
- **Pure core**: Ringmaster's `core/core.ts` is pure decision logic. Side effects in event handler.
- **Chimp state in Postgres**: `chimp_states` table — chimpId, status, createdAt, updatedAt. Read/write via `StateManager` (`@mnke/circus-shared/components`).
- **Chimp profiles in Postgres**: `chimp_profile_definitions` table — name + jsonb definition. Read/write via `ProfileStore`. Profile *assignments* (chimpId → profile name) live in `chimp_profiles` table via `ChimpProfileStore`.
- **Types in shared**: Put types in `packages/shared/src/standards/`, not separate files.

### NATS Subject Topology

```
events.{platform}.{...path}              — world events (usher publishes)
commands.{chimpId}                       — direct commands to chimps (dashboard, chimp-to-chimp)
outputs.{chimpId}                        — chimp output messages (data-plane)
meta.lifecycle.{chimpId}                 — chimp lifecycle broadcasts (status/profile/topics/dispatch)
meta.orchestration.{action}.{chimpId}    — orchestration control plane (set-profile, subscribe-topic, ensure-job, ...)
```

Streams: `events`, `commands`, `outputs`, `orchestration` (all JetStream).

Each chimp has:
- Events consumer: `chimp-{chimpId}` on `events` stream (filtered to subscribed topics)
- Commands consumer: `chimp-{chimpId}-commands` on `commands` stream

Ringmaster has:
- `event-listener` consumer on `events.>` — dispatch
- `ringmaster-orchestration` consumer on `meta.orchestration.>` — control plane
- (Used to listen on `outputs.>` for `chimp-request`; that coupling was removed — bullhorn now translates `chimp-request` outputs into orchestration actions.)

## Orchestration Control Plane

`meta.orchestration.>` is durable JetStream. Producers (currently bullhorn; future: usher, dashboard) publish discrete `OrchestrationAction` messages — `set-profile`, `subscribe-topic`, `set-topics`, `unsubscribe-topic`, `ensure-consumers`, `ensure-job`, `delete-chimp`. Ringmaster's core decides what internal Actions each one maps to.

Action `type` strings are kebab-case; internal core `Action` types stay snake_case for now (pending project-wide migration).

## Chimp Handoff

Chimps hand off work to a new chimp with a different profile using `chimp_request`. The old chimp publishes a single `chimp-request` output. Bullhorn expands it into a 4-message orchestration sequence (`set-profile` + `subscribe-topic` + `ensure-consumers` + `ensure-job`) on `meta.orchestration.>`. The old chimp also publishes follow-up `chimp-command` outputs (subscribe-topic init command, add-event-context, continue work) — those are data-plane and bullhorn forwards them to the new chimp's `events.direct.{chimpId}.command` subject.

## Project Structure

**Structure reflects intent.** Where code lives communicates what it does, what it depends on, and who should care about it. Bad structure forces readers to open files to understand them. Good structure makes the codebase navigable by convention.

### Shared package layout (`packages/shared/`)

| Path | Purpose | Depends on |
|------|---------|------------|
| `src/standards/` | Constants, naming conventions, Zod schemas for domain types | Nothing (leaf) |
| `src/protocol.ts` | Wire protocol — commands, outputs, meta events | `standards/` |
| `src/db/` | Database schema (Drizzle), client factory | Nothing (leaf) |
| `src/components/` | Data access + business logic (TopicRegistry, ProfileStore) | `db/`, `standards/`, external stores |
| `src/lib/` | Pure utilities — env reading, NATS helpers, parsers, typing | Nothing (leaf) |

### Principles

1. **Leaf modules have no internal dependencies.** `standards/`, `db/`, `lib/` don't import each other. This keeps them independently testable and prevents cycles.

2. **Components compose leaves.** `components/` imports from `db/`, `standards/`, and external packages (NATS, Postgres, Redis). This is the only layer that talks to external stores.

3. **Export paths match purpose.** `@mnke/circus-shared/lib` for utilities, `@mnke/circus-shared/db` for persistence, `@mnke/circus-shared/components` for data access. Consumers import from the path that matches what they need — not a kitchen-sink re-export.

4. **Don't put things where they don't belong.** A database client is not a "lib utility." A topic registry is not a "lib helper." If something talks to an external system, it's a service. If something defines table schemas, it's db. Misplacing code erodes the meaning of the structure over time.

5. **Structure is load-bearing.** When someone adds a new file, the directory it goes in should be obvious from the conventions above. If it's not obvious, the structure needs refining — not a "misc" folder.

## TypeScript Safety

**CRITICAL: NEVER use type assertions or casting to bypass type errors.**

- NEVER use `as Type` cast values
- NEVER use `<Type>` syntax cast
- NEVER use `any` silence type errors
- If type error unsolvable → ask user for help
- Add helper fns to lib instead of casting

Type casting bypass safety, make false confidence, cause runtime crashes. Types no match = code wrong. Fix proper.

## Single Source of Truth for Types

**NEVER hand-write types that duplicate schema-derived types from shared.**

- If a type exists in `@mnke/circus-shared` (Protocol, Standards), import it — never redefine locally
- Use `Protocol.ChimpCommand`, not a local union of command types
- Use `Standards.Chimp.ChimpState`, not a local interface with the same fields
- This ensures adding a new variant (new command, new status, new field) forces compile errors at every usage site
- Local type aliases that re-export shared types are fine: `type ChimpState = Standards.Chimp.ChimpState`
- Local types that *mirror* shared types are not: `interface ChimpState { chimpId: string; ... }`

Duplicated types silently drift when the source changes, hiding real bugs. The compiler can only enforce consistency if there's one definition.

**NEVER re-export external SDK types from shared.** Shared (`@mnke/circus-shared`) defines circus-owned types only. If a package needs types from `@opencode-ai/sdk`, `@anthropic-ai/claude-agent-sdk`, etc., it imports them directly. Shared should not depend on brain-specific SDKs.

## Bun Usage

Use Bun not Node.js.

- `bun <file>` not `node <file>` or `ts-node <file>`
- `bun test` not `jest` or `vitest`
- `bun build <file.html|file.ts|file.css>` not `webpack` or `esbuild`
- `bun install` not `npm install` or `yarn install` or `pnpm install`
- `bun run <script>` not `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- `bunx <package> <command>` not `npx <package> <command>`
- Bun load .env automatic. No `dotenv`.

### APIs

- `Bun.serve()` do WebSockets, HTTPS, routes. No `express`.
- `bun:sqlite` for SQLite. No `better-sqlite3`.
- `Bun.redis` for Redis. But this repo uses `ioredis` — keep using that.
- Postgres via `postgres` (postgres.js) + Drizzle ORM. Not `Bun.sql` (ringmaster must run on Node due to K8s API).
- `WebSocket` built-in. No `ws`.
- `Bun.file` better than `node:fs` readFile/writeFile
- Bun.$`ls` not execa.

### Frontend

Use HTML imports with `Bun.serve()`. No `vite`. HTML imports support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  websocket: {
    open: (ws) => { ws.send("Hello, world!"); },
    message: (ws, message) => { ws.send(message); },
    close: (ws) => {},
  },
  development: { hmr: true, console: true },
})
```

HTML files import .tsx, .jsx, .js direct. Bun bundler transpile & bundle automatic.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

```sh
bun --hot ./index.ts
```

More info in Bun API docs at `node_modules/bun-types/docs/**.mdx`.

### Testing

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Key Patterns

- Bun.serve for HTTP + WebSocket. Routes defined as object with path keys.
- Use `Bun.BunRequest<"/path/:param">` for typed route params.
- Type-safe env reading: Use `ER.str("VAR").fallback("default")` or `ER.int("PORT").fallback(8299)` from `@mnke/circus-shared/lib`
- Workspace: `"@mnke/circus-shared": "workspace:*"` for internal packages.
- Bun.serve routes: use explicit `routes: { ... }` object, NOT spread operator (causes type error with websocket required)

## Resource Ownership

**Rule: Each component owns its resources. Creation and destruction are coupled.**

### Ownership model

```
COMPONENT LIFECYCLE
═══════════════════════════════════════════════════════════════

creation              usage                 destruction
    │                  │                       │
    ▼                  ▼                       ▼
┌─────────┐      ┌─────────────┐        ┌─────────────┐
│ new Foo │ ──▶  │ foo.doWork  │ ──▶    │ foo.close() │
└─────────┘      └─────────────┘        └─────────────┘
     │                                    │
     └────────── ownership ───────────────┘
```

**Principles:**

1. **Create what you own** — If component creates a resource (NATS, Redis), it manages lifecycle
2. **Destroy what you own** — `cleanup()` / `close()` / `drain()` paired with creation
3. **Transfer is explicit** — If passing ownership, document clearly in constructor params

### Pattern: Constructor receives, destructor cleans up

```typescript
// Good — class owns connection, creates and destroys it
class Foo {
  private nc: NatsConnection;

  constructor(url: string) {
    this.nc = connect({ servers: url });
  }

  async cleanup() {
    await this.nc.close();
  }
}

// Good — owner transfers via explicit parameter
class Bar {
  constructor(private nc: NatsConnection) {}
}
```

### Transferring ownership

Transfer is acceptable when explicit:

```typescript
// Caller creates, transfers ownership
const nc = connect({ servers: url });
const service = new Service(nc); // Service now owns nc

// Caller destroys after transfer
await service.cleanup();
```

### Common resources

- **NATS connections** — Owner's `cleanup()` must close
- **Redis connections** — Owner's `cleanup()` must quit
- **Streams/readers** — Owner's `cancel()` must be called

Ensure every resource created has a clear destruction path documented in the component's interface.

## Comments

**Prefer self-documenting code over comments.** If code needs a comment to explain it → refactor instead.

- DELETE: Comments that restate what the code does (`// Connect to Redis`)
- KEEP: Non-obvious rationale, race conditions, magic values
- RECOMMENDED: File/class docstrings at top of file

## Magic Numbers and Strings

**NEVER use unexplained numeric literals or string slicing indices.**

- Extract constants with descriptive names
- If slicing arrays/strings, derive indices from the data structure (e.g. `prefix.length + 1` not `6`)
- Use named functions for non-obvious transformations

## Imports

**NEVER use dynamic `import()` for types.** Always use a top-level `import type` statement.

```typescript
// Bad — inline dynamic import for a type
getPod: (id: string) => import("@kubernetes/client-node").V1Pod | undefined;

// Good — import at top of file
import type * as k8s from "@kubernetes/client-node";
getPod: (id: string) => k8s.V1Pod | undefined;
```

Dynamic imports are for runtime module loading. Using them to avoid a top-level import is lazy and unreadable.

## Environment Configuration

**Rule: All env reading at program entrypoint. Components receive config via constructor/injection.**

### Why lifecycle management matters

```
┌─────────────────────────────────────────────────────────┐
│                  PROGRAM LIFECYCLE                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  entrypoint (index.ts)          component (*.ts)        │
│  ┌─────────────────┐          ┌─────────────────┐       │
│  │ 1. Read env     │ config   │ 3. Receive      │       │
│  │    (EnvReader) └─────────▶ │    via ctor     │       │
│  │ 2. Validate     │          │ 4. Use data     │       │
│  │    (fail fast)  │          │    (pure logic) │       │
│  └─────────────────┘          └─────────────────┘       │
│         ▲                              │                │
│         │                              ▼                │
│    process.env              no process.env access       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Problems with direct process.env in components:**

1. **Testing becomes fragile** — Components can't be instantiated without env vars set, making unit tests brittle.

2. **Lifecycle coupling** — A component shouldn't know WHEN it's being run. The same code runs in tests (with mocks), in production, in retries. Hardcoded env reads make this impossible.

3. **Harder to reason about** — If any component can read env at any point, the full state space is unknown. Configuration flows should be traceable: entrypoint → component.

4. **No fail-fast at startup** — Env misconfig won't surface until deep in the call stack. Entrypoint validation catches this immediately.

5. **State hidden in globals** — `process.env` is a global mutable state. Makes code harder to reason about, breaks atomic predictability.

**What "entrypoint" means:**

Usually the `index.ts` file that calls `new Component()`. In a service with multiple entrypoints (CLI, tests), each entrypoint reads its own required env. Components stay pure.

### Never read process.env directly in components

```typescript
// Bad — component reads env directly
class MyComponent {
  constructor() {
    this.url = process.env.MY_URL; // ✗
  }
}

// Good — entrypoint reads env, passes to component
const config = ER.record("MY").str("url").read(process.env);
const comp = new MyComponent(config.url);
```

### Use EnvReader at entrypoint

```typescript
import { EnvReader as ER } from "@mnke/circus-shared/lib";

const config = ER.record("RINGMASTER")
  .str("natsUrl").fallback("nats://localhost:4222")
  .str("redisUrl").fallback("redis://localhost:6379")
  .read(process.env);

new Ringmaster(config);
```

### Exceptions (allowed direct read)

| Variable             | Reason                                           |
|---------------------|--------------------------------------------------|
| `LOG_LEVEL`          | Logger needs at import time, before config flows  |
| `NODE_ENV`           | Bun.serve dev mode tied to server lifecycle       |
| Build-time constants | e.g., `"process.env.NODE_ENV"` in bundler config |

### Config interface pattern

```typescript
export interface MyComponentConfig {
  natsUrl: string;
  timeout: number;
}

class MyComponent {
  constructor(config: MyComponentConfig) {}
}
```

## Import Conventions

**Always use namespaced imports.** Never re-export types at the top level.

```typescript
// Bad — prevents Protocol.ChimpProfile access
export type { ChimpProfile } from "./protocol";

// Good — preserved namespace access
export * as Protocol from "./protocol";

// Always import via namespace
import { Protocol } from "@mnke/circus-shared";
const profile: Protocol.ChimpProfile = ...;
```

## Key Files

- `packages/shared/src/standards/chimp.ts` — NATS subject naming, stream names, consumer names, ChimpState type
- `packages/shared/src/standards/topic.ts` — topic schema, serialization, event subject parsing
- `packages/shared/src/db/schema.ts` — Drizzle tables: `topic_subscriptions`, `chimp_profiles`, `chimp_states`, `chimp_profile_definitions`
- `packages/shared/src/components/topic-registry.ts` — topic subscription registry (Postgres + NATS consumer management)
- `packages/shared/src/components/state-manager.ts` — chimp lifecycle state (Postgres)
- `packages/shared/src/components/profile-store.ts` — chimp profile definitions (Postgres)
- `packages/shared/src/protocol.ts` — all Zod schemas (commands, outputs, meta events, event context)
- `packages/ringmaster/src/core/core.ts` — pure decision logic (event routing, chimp spawning)
- `packages/chimp/src/chimp-brain/chimp-brain.ts` — base brain class (command dispatch, overridable handlers)
