import type * as Protocol from "../protocol";

export type ActivityEvent =
  | {
      id: string;
      type: "event";
      timestamp: string;
      data: Protocol.ChimpCommand;
    }
  | {
      id: string;
      type: "output";
      timestamp: string;
      data: Protocol.ChimpOutputMessage;
    }
  | { id: string; type: "meta"; timestamp: string; data: Protocol.MetaEvent }
  | { id: string; type: "unknown"; timestamp: string; data: unknown };
