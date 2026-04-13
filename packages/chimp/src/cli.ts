#!/usr/bin/env bun

import * as Commander from "@commander-js/extra-typings";
import type { ChimpCommand } from "@mnke/circus-shared/protocol";

const DEFAULT_PORT = 5928;

interface GlobalOpts {
  port: string;
}

async function sendCommand(port: number, command: ChimpCommand): Promise<void> {
  const res = await fetch(`http://localhost:${port}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });

  if (res.status !== 202) {
    const body = await res.text();
    console.error(`Failed to send command: ${res.status} ${body}`);
    process.exit(1);
  }
}

const program = new Commander.Command()
  .name("chimp")
  .description("CLI for local Chimp development")
  .option("-p, --port <port>", "HTTP port", String(DEFAULT_PORT));

// send-agent-message command
program
  .command("send-agent-message")
  .description("Send a message to the agent")
  .requiredOption("--prompt <prompt>", "The prompt to send")
  .action(async (localOpts, cmd) => {
    const globalOpts = cmd.optsWithGlobals() as GlobalOpts;
    const port = parseInt(globalOpts.port, 10);
    const command: ChimpCommand = {
      command: "send-agent-message",
      args: { prompt: localOpts.prompt },
    };
    await sendCommand(port, command);
  });

// clone-repo command
program
  .command("clone-repo")
  .description("Clone a git repository")
  .requiredOption("--url <url>", "Repository URL")
  .option("--branch <branch>", "Branch to checkout")
  .option("--path <path>", "Local path to clone to")
  .action(async (localOpts, cmd) => {
    const globalOpts = cmd.optsWithGlobals() as GlobalOpts;
    const port = parseInt(globalOpts.port, 10);
    const command: ChimpCommand = {
      command: "clone-repo",
      args: {
        url: localOpts.url,
        ...(localOpts.branch && { branch: localOpts.branch }),
        ...(localOpts.path && { path: localOpts.path }),
      },
    };
    await sendCommand(port, command);
  });

// set-working-dir command
program
  .command("set-working-dir")
  .description("Set the working directory")
  .requiredOption("--path <path>", "Path to set as working directory")
  .action(async (localOpts, cmd) => {
    const globalOpts = cmd.optsWithGlobals() as GlobalOpts;
    const port = parseInt(globalOpts.port, 10);
    const command: ChimpCommand = {
      command: "set-working-dir",
      args: { path: localOpts.path },
    };
    await sendCommand(port, command);
  });

// stop command
program
  .command("stop")
  .description("Stop the chimp")
  .action(async (_localOpts, cmd) => {
    const globalOpts = cmd.optsWithGlobals() as GlobalOpts;
    const port = parseInt(globalOpts.port, 10);
    const command: ChimpCommand = {
      command: "stop",
    };
    await sendCommand(port, command);
  });

program.parse(process.argv);
