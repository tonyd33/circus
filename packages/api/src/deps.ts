import {
  ChimpProfileStore,
  ProfileStore,
  StateManager,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import { createDatabase } from "@mnke/circus-shared/db";
import type * as Logger from "@mnke/circus-shared/logger";
import { connect, type NatsConnection } from "nats";
import { ChimpService } from "./chimps/service";
import { MessageService } from "./messages/service";
import { ProfileService } from "./profiles/service";

export interface DepsConfig {
  natsUrl: string;
  databaseUrl: string;
  defaultProfile: string;
}

export interface Deps {
  nc: NatsConnection;
  topicRegistry: TopicRegistry;
  chimpService: ChimpService;
  messageService: MessageService;
  profileService: ProfileService;
  logger: Logger.Logger;
}

export async function initDeps(
  config: DepsConfig,
  logger: Logger.Logger,
): Promise<Deps> {
  const nc = await connect({
    servers: config.natsUrl,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  });
  logger.info({ url: config.natsUrl }, "Connected to NATS");

  const db = createDatabase(config.databaseUrl);
  const topicRegistry = new TopicRegistry(nc, db);
  await topicRegistry.start();

  const chimpProfileStore = new ChimpProfileStore(db, config.defaultProfile);
  const profileStore = new ProfileStore(db);
  const statusSource = new StateManager(db);

  const chimpService = new ChimpService(
    statusSource,
    chimpProfileStore,
    topicRegistry,
    nc,
    logger.child({ component: "ChimpService" }),
  );
  const messageService = new MessageService(
    nc,
    logger.child({ component: "MessageService" }),
  );
  const profileService = new ProfileService(
    profileStore,
    logger.child({ component: "ProfileService" }),
  );

  return {
    nc,
    topicRegistry,
    chimpService,
    messageService,
    profileService,
    logger,
  };
}

export async function closeDeps(deps: Deps): Promise<void> {
  await deps.nc.drain();
  await deps.nc.close();
}
