import { Elysia } from "elysia";
import type { Deps } from "../deps";

export const depsPlugin = (deps: Deps) =>
  new Elysia({ name: "circus-deps" }).decorate("deps", deps);
