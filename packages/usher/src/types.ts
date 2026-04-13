export type { Adapter, AdapterResult } from "./adapters/types.ts";

export interface RouteConfig {
  adapter: string;
  path: string;
}
