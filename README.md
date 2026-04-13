# Circus

Distributed platform for orchestrating fleets of AI agents. External events come in, get routed to agents, agents do work, results go out. Built on NATS JetStream, Redis, and Kubernetes.

## The Metaphor

Every package maps to a circus role:

| Package | Role |
|---------|------|
| **Ringmaster** | Watches for incoming work and manages agent lifecycle — spins up chimps, tracks their state, cleans up when they're done |
| **Chimp** | The performing agent. Receives commands, does AI work via a pluggable brain (Claude, Opencode, etc.), publishes results |
| **Usher** | Front door. HTTP gateway that translates external events (Slack webhooks, debug requests) into agent commands on NATS |
| **Bullhorn** | Announcer. Picks up agent output from NATS and routes it to destinations (console, Slack, etc.) |
| **Shared** | The tent. Types, protocol definitions, naming conventions, and utilities used by everything else |
| **Dashboard** | Audience view. Real-time monitoring UI for watching agent activity |
| **Ledger** | Ticket ledger. State tracking (stub) |

## Message Flow

```
                          ┌─────────────┐
                          │ Ringmaster  │
                          │ (watches +  │
                          │  orchestrates)
                          └──────┬──────┘
                                 │ creates/destroys
                                 ▼
External ──► Usher ──► NATS ──► Chimp ──► NATS ──► Bullhorn ──► Destinations
 events      (in)    (inputs)  (work)   (outputs)   (out)
```

Ringmaster doesn't sit in the message path. It watches the input stream and Kubernetes pod events, then decides when to spin up or tear down chimps.

## Development

**Prerequisites:** Bun, Minikube, Helm

```sh
bun install
./setup_dev.sh
```

`setup_dev.sh` builds Docker images, sets up infrastructure, and deploys the Helm chart with dev values. See `deploy/dev/` for infrastructure details and `charts/circus/` for Helm configuration.

## Project Structure

```
packages/
  shared/        Core types, protocol (Zod), naming standards, utilities
  ringmaster/    Orchestrator — K8s + NATS + Redis
  chimp/         Agent executor — pluggable AI brains
  usher/         HTTP → NATS gateway — pluggable adapters
  bullhorn/      NATS → destinations — pluggable output handlers
  dashboard/     React monitoring UI
  ledger/        State tracking (stub)
```

For design decisions and architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
