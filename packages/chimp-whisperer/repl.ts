/**
 * Interactive REPL for communicating with Chimp agents
 *
 * Usage:
 *   bun repl.ts [exchange-name]
 *
 * Environment variables:
 *   CONDUIT_API_URL - Conduit API server URL (default: http://localhost:8090)
 *   ANTHROPIC_API_KEY - Anthropic API key (required for creating new exchanges)
 *   CHIMP_IMAGE - Chimp container image (default: circus-chimp:latest)
 *   CHIMP_NAMESPACE - Kubernetes namespace (default: default)
 */

import { ChimpWhisperer } from "./index";
import * as readline from "node:readline";

const CONDUIT_API_URL = process.env.CONDUIT_API_URL || "http://localhost:8090";
const CHIMP_IMAGE = process.env.CHIMP_IMAGE || "circus-chimp:latest";
const CHIMP_NAMESPACE = process.env.CHIMP_NAMESPACE || "default";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

function print(text: string, color?: keyof typeof colors) {
  const colorCode = color ? colors[color] : "";
  console.log(`${colorCode}${text}${colors.reset}`);
}

function printBanner() {
  print("\n╔════════════════════════════════════════╗", "cyan");
  print("║      Chimp Whisperer Interactive       ║", "cyan");
  print("╚════════════════════════════════════════╝\n", "cyan");
}

function printHelp() {
  print("\nAvailable commands:", "bright");
  print("  /help                        - Show this help message", "dim");
  print("  /status                      - Get agent status", "dim");
  print("  /new-session                 - Start a new session", "dim");
  print("  /fork                        - Fork the current session", "dim");
  print("  /model <name>                - Change the Claude model", "dim");
  print("  /tools <tools...>            - Set allowed tools (comma-separated)", "dim");
  print("  /clone <url> [branch] [path] - Clone a git repository", "dim");
  print("  /cd <path>                   - Set working directory", "dim");
  print("  /save                        - Save current session to S3", "dim");
  print("  /restore <session-id>        - Restore session from S3", "dim");
  print("  /exit, /quit                 - Exit the REPL", "dim");
  print("\nOr just type a message to send to the agent.\n", "dim");
  print("Note: All responses come asynchronously through the stream.\n", "dim");
}

async function main() {
  const exchangeName = process.argv[2] || `chimp-${Date.now()}`;

  printBanner();
  print(`Creating exchange: ${exchangeName}`, "cyan");
  print(`API URL: ${CONDUIT_API_URL}`, "dim");
  print(`Image: ${CHIMP_IMAGE}`, "dim");
  print(`Namespace: ${CHIMP_NAMESPACE}\n`, "dim");

  if (!process.env.ANTHROPIC_API_KEY) {
    print("⚠️  Warning: ANTHROPIC_API_KEY not set", "yellow");
    print("   Set it in your environment or the chimp won't work\n", "yellow");
  }

  let whisperer: ChimpWhisperer;

  try {
    print("Connecting to Conduit and creating exchange...", "dim");
    whisperer = await ChimpWhisperer.create({
      apiBaseUrl: CONDUIT_API_URL,
      exchangeName,
      namespace: CHIMP_NAMESPACE,
      image: CHIMP_IMAGE,
      natsUrl: "nats://localhost:4222",
      env: [
        {
          name: "ANTHROPIC_API_KEY",
          value: process.env.ANTHROPIC_API_KEY || "",
        },
        {
          name: "S3_BUCKET",
          value: "claude-sessions",
        },
        {
          name: "S3_ENDPOINT",
          value: "http://minio:9000",
        },
        {
          name: "S3_REGION",
          value: "us-east-1",
        },
      ],
    });
    print("✓ Connected!\n", "green");
  } catch (error) {
    print(`✗ Failed to create exchange: ${error}`, "red");
    process.exit(1);
  }

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.cyan}You: ${colors.reset}> `,
  });

  // Subscribe to ALL messages from the chimp
  const subscriptionPromise = whisperer.subscribe((message) => {
    // Clear the current line and move cursor to start
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    switch (message.type) {
      case "agent-message-response":
        print(`\n${colors.green}Chimp:${colors.reset}`, "reset");
        print(message.content, "reset");
        print(`${colors.dim}(session: ${message.sessionId})${colors.reset}\n`, "reset");
        break;

      case "status-response":
        print("\nAgent Status:", "bright");
        print(`  Session ID: ${message.sessionId || "none"}`, "dim");
        print(`  Messages: ${message.messageCount}`, "dim");
        print(`  Model: ${message.model}`, "dim");
        break;

      case "save-session-response":
        print("✓ Session saved successfully:", "green");
        print(`  S3 Path: ${message.s3Path}`, "dim");
        print(`  Session ID: ${message.sessionId}\n`, "dim");
        break;

      case "progress":
        print(
          `  [Progress] ${message.message}${message.percentage ? ` (${message.percentage}%)` : ""}`,
          "blue",
        );
        break;

      case "log": {
        const logColor =
          message.level === "error"
            ? "red"
            : message.level === "warn"
              ? "yellow"
              : "dim";
        print(`  [${message.level.toUpperCase()}] ${message.message}`, logColor);
        break;
      }

      case "artifact":
        print(`  [Artifact] ${message.name}`, "magenta");
        if (message.metadata) {
          print(`    ${JSON.stringify(message.metadata)}`, "dim");
        }
        break;

      case "error":
        print(`✗ Error: ${message.error}`, "red");
        if (message.command) {
          print(`  Command: ${message.command}`, "dim");
        }
        if (message.details) {
          print(`  Details: ${JSON.stringify(message.details)}\n`, "dim");
        }
        break;
    }

    // Redraw prompt
    rl.prompt(true);
  });

  // Handle cleanup on exit
  const cleanup = async () => {
    print("\n\nCleaning up...", "dim");
    rl.close();
    try {
      await whisperer.destroy();
      print("✓ Exchange deleted\n", "green");
    } catch (error) {
      print(`✗ Error during cleanup: ${error}`, "red");
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  printHelp();
  print("Ready! Type your message or /help for commands\n", "green");

  // Handle line input
  rl.on("line", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (trimmed.startsWith("/")) {
      const [cmd, ...args] = trimmed.slice(1).split(/\s+/);

      if (!cmd) {
        rl.prompt();
        return;
      }

      try {
        switch (cmd.toLowerCase()) {
          case "help":
            printHelp();
            break;

          case "status":
            await whisperer.getStatus();
            // Response will come through subscribe handler
            break;

          case "new-session":
            await whisperer.newSession();
            // Response will come through subscribe handler
            break;

          case "fork":
            await whisperer.forkSession();
            // Response will come through subscribe handler
            break;

          case "model":
            if (!args[0]) {
              print("Usage: /model <model-name>", "yellow");
              break;
            }
            await whisperer.setModel(args[0]);
            // Response will come through subscribe handler
            break;

          case "tools": {
            if (!args.length) {
              print("Usage: /tools <tool1,tool2,...>", "yellow");
              break;
            }
            const tools = args
              .join(" ")
              .split(",")
              .map((t) => t.trim());
            await whisperer.setAllowedTools(tools);
            // Response will come through subscribe handler
            break;
          }

          case "clone": {
            if (!args[0]) {
              print("Usage: /clone <url> [branch] [path]", "yellow");
              break;
            }
            const [url, branch, path] = args;
            await whisperer.cloneRepo(url, branch, path);
            // Response will come through subscribe handler (log messages)
            break;
          }

          case "cd": {
            if (!args[0]) {
              print("Usage: /cd <path>", "yellow");
              break;
            }
            const path = args.join(" ");
            await whisperer.setWorkingDir(path);
            // Response will come through subscribe handler (log messages)
            break;
          }

          case "save": {
            await whisperer.saveSession();
            // Response will come through subscribe handler (save-session-response)
            break;
          }

          case "restore": {
            if (!args[0]) {
              print("Usage: /restore <session-id>", "yellow");
              break;
            }
            const sessionId = args[0];
            await whisperer.restoreSession(sessionId);
            // Response will come through subscribe handler (log messages)
            break;
          }

          case "exit":
          case "quit":
            await cleanup();
            return;

          default:
            print(`Unknown command: /${cmd}`, "red");
            print("Type /help for available commands\n", "dim");
        }
      } catch (error) {
        print(`✗ Error sending command: ${error}`, "red");
      }

      rl.prompt();
      return;
    }

    // Send message to agent
    try {
      await whisperer.sendMessage(trimmed);
      print("  Message sent, waiting for response...\n", "dim");
    } catch (error) {
      print(`✗ Error sending message: ${error}\n`, "red");
    }

    rl.prompt();
  });

  rl.on("close", async () => {
    await cleanup();
  });

  // Start the prompt
  rl.prompt();
}

// Run the REPL
main().catch((error) => {
  print(`\n✗ Fatal error: ${error}`, "red");
  process.exit(1);
});
