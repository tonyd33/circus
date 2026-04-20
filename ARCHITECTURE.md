# Architecture

## Design Philosophy

- **Event-centric, not agent-centric.** NATS subjects describe what happened in the world, not which agent should handle it. Chimps subscribe to events they care about.
- **Chimps are cattle, not pets.** Ephemeral, disposable, spun up per-task. No precious state on the agent itself.
- **Pure core, effectful shell.** Ringmaster's decision logic is a pure function (`packages/ringmaster/src/core/core.ts`). Side effects (K8s API calls, Redis writes, NATS publishes) happen in the event handler. Core is unit-testable without mocking infrastructure.
- **Extend through interfaces, not modification.** New AI backends, input sources, and output destinations plug in without changing existing code.

## Components

```
┌──────────┐     events.{platform}.{...}      ┌──────────────────────┐
│  Usher   │ ──────────────────────────────▶  │   NATS JetStream     │
│ (ingress)│                                  │                      │
└──────────┘                                  │  Stream: events      │
                                              │  Stream: commands    │
┌──────────┐     outputs.{chimpId}            │  Stream: outputs     │
│ Bullhorn │ ◀──────────────────────────────  │                      │
│(dispatch)│                                  │  KV: topic-owners    │
└──────────┘                                  └──────────┬───────────┘
                                                         │
┌──────────┐   watches events.>, spawns chimps           │
│Ringmaster│ ◀───────────────────────────────────────────┤
│  (orch)  │                                             │
└──────────┘                                             │
                                              ┌──────────┴───────────┐
┌──────────┐   events consumer + commands     │      Chimp Pod       │
│Dashboard │   consumer per chimp             │  Brain (Claude/OC)   │
│  (UI)    │                                  │  MCP (tools)         │
└──────────┘                                  └──────────────────────┘
```

## Extension Points

**Chimp Brains** — `ChimpBrain` abstract class in `packages/chimp/src/chimp-brain/chimp-brain.ts`. Base class handles all command dispatch (clone, working dir, system prompt, github auth). Subclasses implement `handlePrompt()`. Current: Claude, Opencode, Echo.

**Usher Adapters** — `Adapter` interface in `packages/usher/src/adapters/types.ts`. Translates HTTP requests into event subjects + commands. Adapters describe *what happened* — they don't decide routing. Current: GitHub, Discord, Debug, Slack (stub).

**Output Types** — `ChimpOutputMessageSchema` discriminated union in `packages/shared/src/protocol.ts`. Bullhorn dispatches per output type. Current: agent-message-response, github-comment, discord-response, chimp-request, artifact, progress, log, error, thought.

## NATS Subject Topology

Three subject trees, three JetStream streams:

```
events.{platform}.{...path}      — what happened in the world
commands.{chimpId}                — direct commands to a specific chimp
outputs.{chimpId}                 — messages from chimps
```

Plus `meta.{chimpId}` for lifecycle events (plain NATS, not JetStream).

### Event Subjects

Hierarchical, wildcard-friendly:

```
events.github.{owner}.{repo}.pr.{number}.comment
events.github.{owner}.{repo}.pr.{number}.review_comment
events.github.{owner}.{repo}.issue.{number}.comment
events.github.{owner}.{repo}.issue.{number}.opened
events.discord.{guild}.{channel}.message
events.debug.{id}
```

### Topic Subscriptions

Chimps express interest in topics via the `subscribe_topic` MCP tool. Subscriptions stored in NATS KV bucket `topic-owners` with atomic put-if-absent for single-subscriber enforcement.

When an event arrives, ringmaster checks the topic registry:
- **Claimed** → event delivered to subscribed chimp's consumer (no action needed)
- **Unclaimed** → ringmaster derives a new chimpId, spawns chimp, registers topic

This enables cross-platform continuity: a chimp triggered from Discord can subscribe to a GitHub PR topic and receive future PR comments.

### Consumer Model

Each chimp has two durable consumers:
- **Events consumer** `chimp-{chimpId}` on `events` stream — filtered to subscribed topic wildcards
- **Commands consumer** `chimp-{chimpId}-commands` on `commands` stream — filtered to `commands.{chimpId}`

Topic subscriptions dynamically add filter subjects to the events consumer.

## Ringmaster's Decision Model

Pure function: given state + event → list of actions.

```typescript
decide(state: CoreState, chimpId: string, payload: EventPayload): Decision
```

`CoreState` includes: current time, pod status, topic ownership.

Event types:
- `event_received` — new event on the events stream (topic lookup + spawn decision)
- `pod_event` — K8s pod lifecycle change (state update + cleanup)

Actions: `create_job`, `create_consumers`, `register_topic`, `delete_consumers`, `cleanup_topics`, `upsert_state`, `delete_state`, `noop`.

Event handler executes actions against real infrastructure (K8s, NATS, Redis).

## Chimp Lifecycle

1. External event → usher publishes to `events.{platform}.{...}`
2. Ringmaster's event listener detects it
3. Topic registry lookup: claimed or unclaimed?
4. If unclaimed: core derives chimpId, decides to spawn
5. Event handler creates consumers + K8s job + registers topic
6. Pod starts, chimp connects to events + commands consumers
7. Chimp executes init commands from profile (github auth, repo clone, etc.)
8. Chimp processes events through its brain, publishes output to `outputs.{chimpId}`
9. Chimp may call `subscribe_topic` to receive events from other topics/platforms
10. Chimp finishes or idles out, pod terminates
11. Ringmaster's pod watcher detects termination
12. Core decides: clean up consumers + topic subscriptions + update state

## Chimp Profiles

Profiles are named presets stored in Redis. Define: brain, model, image, env vars, volume mounts, and init commands. Managed via dashboard UI.

Init commands execute at chimp startup before message processing:
- `setup-github-auth` — fetches GitHub App installation token, configures `gh` CLI + git
- `gh-clone-repo` — clones repo via authenticated `gh` CLI
- `clone-repo` — clones repo via `git`
- `set-working-dir`, `set-system-prompt`, `set-allowed-tools`

## State

**Redis** — ringmaster's view of each chimp: ID, profile, status (scheduled/pending/running/stopped/failed), timestamps. Orchestrator bookkeeping, not agent memory.

**NATS KV** (`topic-owners`) — maps serialized topic keys to `{ chimpId, profile, subscribedAt }`. Used by ringmaster for event routing and by chimps for topic subscription.

**JetStream** — durable message storage. Events survive chimp restarts. New chimps replay messages from their consumer's start sequence.

Chimps are stateless from the platform's perspective. Brain implementations may maintain session state (e.g. Claude conversation history via S3), but that's internal to the brain.
