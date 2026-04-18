# Circus Agent Guide

## Quick Commands

```sh
# Run a package
bun run packages/ringmaster/src/index.ts
bun run packages/ledger/src/index.ts
bun run packages/dashboard/src/index.ts

# Test
bun test

# Typecheck (all packages)
cd packages/ringmaster && bun run typecheck
cd packages/ledger && bun run typecheck

# Dev with hot reload
bun --watch packages/ringmaster/src/index.ts
```

## Packages

| Package | Purpose | Entry |
|---------|---------|-------|
| ringmaster | Chimp lifecycle orchestrator | `src/index.ts` |
| ledger | Chimp status API (reads Redis) | `src/index.ts` |
| dashboard | Web UI (React + Bun.serve) | `src/index.ts` |
| chimp | Agent implementation | `src/index.ts` |
| usher | Input adapters (Slack, etc) | `src/index.ts` |
| bullhorn | Output handlers | `src/index.ts` |
| shared | Types, standards, utils | `src/index.ts` |

## Architecture

- **Event-driven**: Components react to NATS messages and K8s events. No direct calls.
- **Pure core**: Ringmaster's `core/core.ts` is pure decision logic. Side effects in event handler.
- **Chimp state in Redis**: Key pattern `chimp:{id}:state` via `Standards.Chimp.Naming.redisChimpKey()`
- **Types in shared**: Put types in `packages/shared/src/standards/chimp.ts`, not separate files.

## TypeScript Safety

**CRITICAL: NEVER use type assertions or casting to bypass type errors.**

- NEVER use `as Type` cast values
- NEVER use `<Type>` syntax cast
- NEVER use `any` silence type errors
- If type error unsolvable → ask user for help
- Add helper fns to lib instead of casting

Type casting bypass safety, make false confidence, cause runtime crashes. Types no match = code wrong. Fix proper.

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
- `Bun.sql` for Postgres. No `pg` or `postgres.js`.
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
- Type-safe env reading: Use `ER.str("VAR").fallback("default")` or `ER.int("PORT").fallback(3000)` from `@mnke/circus-shared/lib`
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
- OK: File/class docstrings at top of file

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

- `ARCHITECTURE.md` - system design
- `packages/shared/src/standards/chimp.ts` - naming + types (source of truth)
