import type { Logger } from "@mnke/circus-shared";
import type { Adapter } from "@/types";

import { DebugAdapter } from "./debug";
import { SlackAdapter } from "./slack";

export type { Adapter };
export { DebugAdapter, SlackAdapter };

export const ADAPTER_REGISTRY: Record<
  string,
  (logger: Logger.Logger) => Adapter
> = {
  slack: (logger) => new SlackAdapter(logger),
  debug: (logger) => new DebugAdapter(logger),
};
