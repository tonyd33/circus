import type { Adapter } from "@/types";

import { DebugAdapter } from "./debug";
import { SlackAdapter } from "./slack";

export type { Adapter };
export { DebugAdapter, SlackAdapter };

export const ADAPTER_REGISTRY: Record<string, () => Adapter> = {
  slack: () => new SlackAdapter(),
  debug: () => new DebugAdapter(),
};
