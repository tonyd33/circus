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

## Key Patterns

- Bun.serve for HTTP + WebSocket. Routes defined as object with path keys.
- Bun.redis for Redis (but this repo uses `ioredis` - keep using that).
- Use `Bun.BunRequest<"/path/:param">` for typed route params.
- Type-safe env reading: Use `ER.str("VAR").fallback("default")` or `ER.int("PORT").fallback(3000)` from `@mnke/circus-shared/lib`
- Workspace: `"@mnke/circus-shared": "workspace:*"` for internal packages.

## Gotchas

- Always typecheck after changes: `bun run typecheck` in each package
- **NEVER type cast** (`as`, `<Type>`, `any`) - if type error, fix properly or ask user
- Bun loads `.env` automatically - no `dotenv` needed
- Route params accessed via `req.params.paramName` with BunRequest type annotation
- Bun.serve routes: use explicit `routes: { ... }` object, NOT spread operator (causes type error with websocket required)

## Key Files

- `ARCHITECTURE.md` - system design
- `CLAUDE.md` - Bun/TypeScript conventions
- `packages/shared/src/standards/chimp.ts` - naming + types (source of truth)