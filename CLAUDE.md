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

## APIs

- `Bun.serve()` do WebSockets, HTTPS, routes. No `express`.
- `bun:sqlite` for SQLite. No `better-sqlite3`.
- `Bun.redis` for Redis. No `ioredis`.
- `Bun.sql` for Postgres. No `pg` or `postgres.js`.
- `WebSocket` built-in. No `ws`.
- `Bun.file` better than `node:fs` readFile/writeFile
- Bun.$`ls` not execa.

## Testing

Use `bun test` run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

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
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files import .tsx, .jsx, .js direct. Bun bundler transpile & bundle automatic. `<link>` tags point stylesheets, Bun CSS bundler bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then run index.ts

```sh
bun --hot ./index.ts
```

More info in Bun API docs at `node_modules/bun-types/docs/**.mdx`.