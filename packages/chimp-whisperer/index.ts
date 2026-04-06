/**
 * Chimp Whisperer - Client for communicating with Chimp agents via Conduit
 *
 * This client creates an Exchange for a Chimp agent and provides
 * a type-safe interface for sending commands and receiving responses
 * according to the Chimp protocol.
 */

import {
  type ChimpCommand,
  type ChimpOutputMessage,
  createAgentCommand,
  parseChimpOutputMessage,
} from "@mnke/circus-protocol";
import {
  Conduit,
  type ExchangeClient,
  type Message,
} from "@mnke/conduit-client";

/**
 * Configuration for creating a ChimpWhisperer
 */
export interface ChimpWhispererConfig {
  /** Conduit API base URL (e.g., 'http://localhost:8090') */
  apiBaseUrl: string;
  /** E.g. nats://localhost:4222 */
  natsUrl: string;
  /** Name for the Exchange */
  exchangeName: string;
  /** Kubernetes namespace */
  namespace?: string;
  /** Chimp container image (e.g., 'circus-chimp:latest') */
  image: string;
  /** Environment variables for the Chimp container */
  env?: { name: string; value: string }[];
}

/**
 * ChimpWhisperer - High-level client for interacting with Chimp agents
 *
 * Provides a type-safe interface for the Chimp protocol, handling message
 * serialization, validation, and routing.
 *
 * @example
 * ```typescript
 * const whisperer = await ChimpWhisperer.create({
 *   apiBaseUrl: 'http://localhost:8090',
 *   exchangeName: 'my-chimp',
 *   image: 'circus-chimp:latest',
 *   env: { ANTHROPIC_API_KEY: 'sk-...' },
 * });
 *
 * // Send a message to the agent
 * const response = await whisperer.sendMessage(
 *   'Write a function to calculate fibonacci numbers'
 * );
 * console.log(response.content);
 *
 * // Clean up
 * await whisperer.destroy();
 * ```
 */
export class ChimpWhisperer {
  private conduit: Conduit;
  private client: ExchangeClient;
  private config: ChimpWhispererConfig;

  /** @internal */
  constructor(
    conduit: Conduit,
    client: ExchangeClient,
    config: ChimpWhispererConfig,
  ) {
    this.conduit = conduit;
    this.client = client;
    this.config = config;
  }

  /**
   * Create a new ChimpWhisperer instance
   *
   * This will create an Exchange via the Conduit API and connect to it.
   */
  static async create(config: ChimpWhispererConfig): Promise<ChimpWhisperer> {
    // Create Conduit API client
    const conduit = new Conduit({ natsURL: config.natsUrl });

    // Create Exchange and get connected client
    const client = await conduit.createExchangeClient({
      name: config.exchangeName,
      namespace: config.namespace || "default",
      image: config.image,
      env: config.env,
    });

    return new ChimpWhisperer(conduit, client, config);
  }

  /**
   * Send a command to the Chimp
   *
   * Note: This does NOT wait for a response. All messages (including responses
   * to this command) come through the subscribe() handler.
   *
   * @param command - The command to send
   */
  async sendCommand(command: ChimpCommand): Promise<void> {
    await this.client.send(command);
  }

  /**
   * Send a message to the Claude agent
   *
   * Note: The response will come through the subscribe() handler as an
   * agent-message-response message.
   *
   * @param prompt - The prompt to send to the agent
   */
  async sendMessage(prompt: string): Promise<void> {
    const command = createAgentCommand(prompt);
    await this.sendCommand(command);
  }

  /**
   * Request the current status of the Chimp agent
   *
   * Note: The response will come through the subscribe() handler as a
   * status-response message.
   */
  async getStatus(): Promise<void> {
    await this.sendCommand({ command: "get-status" });
  }

  /**
   * Start a new session (abandons current session)
   */
  async newSession(): Promise<void> {
    await this.sendCommand({ command: "new-session" });
  }

  /**
   * Fork the current session
   */
  async forkSession(): Promise<void> {
    await this.sendCommand({ command: "fork-session" });
  }

  /**
   * Set the Claude model to use
   */
  async setModel(model: string): Promise<void> {
    await this.sendCommand({
      command: "set-model",
      args: { model },
    });
  }

  /**
   * Set allowed tools for the agent
   */
  async setAllowedTools(tools: string[]): Promise<void> {
    await this.sendCommand({
      command: "set-allowed-tools",
      args: { tools },
    });
  }

  /**
   * Clone a git repository
   *
   * @param url - Repository URL to clone
   * @param branch - Optional branch to checkout
   * @param path - Optional destination path (defaults to repo name)
   */
  async cloneRepo(url: string, branch?: string, path?: string): Promise<void> {
    await this.sendCommand({
      command: "clone-repo",
      args: { url, branch, path },
    });
  }

  /**
   * Set the working directory for the agent
   *
   * @param path - Path to the directory
   */
  async setWorkingDir(path: string): Promise<void> {
    await this.sendCommand({
      command: "set-working-dir",
      args: { path },
    });
  }

  /**
   * Save the current session to S3
   *
   * Note: The response will come through the subscribe() handler as a
   * save-session-response message with the S3 path.
   */
  async saveSession(): Promise<void> {
    await this.sendCommand({
      command: "save-session",
      args: { method: "s3" },
    });
  }

  /**
   * Restore a session from storage
   *
   * @param sessionId - Session ID to restore
   */
  async restoreSession(sessionId: string): Promise<void> {
    await this.sendCommand({
      command: "restore-session",
      args: { sessionId, method: "s3" },
    });
  }

  /**
   * Subscribe to autonomous messages from the Chimp
   *
   * This allows you to receive progress updates, logs, and artifacts
   * that the Chimp emits on its own (not in response to commands).
   *
   * @param handler - Callback for handling messages
   * @returns Promise that resolves when subscription ends
   */
  async subscribe(
    handler: (message: ChimpOutputMessage) => void | Promise<void>,
  ): Promise<void> {
    await this.client.subscribe(async (msg: Message) => {
      try {
        const parsed = parseChimpOutputMessage(msg.payload);
        await handler(parsed);
      } catch (error) {
        console.error("Error parsing Chimp message:", error);
      }
    });
  }

  /**
   * Send a raw command (for advanced usage)
   */
  async sendRaw(payload: unknown): Promise<void> {
    await this.client.send(payload);
  }

  /**
   * Close the connection to the Exchange
   */
  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * Destroy the ChimpWhisperer and delete the Exchange
   *
   * This will close the connection and delete the Exchange from Kubernetes.
   */
  async destroy(): Promise<void> {
    await this.conduit.deleteExchangeClient(this.client);
  }
}
