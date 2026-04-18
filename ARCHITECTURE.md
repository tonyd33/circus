# Architecture

## Design Philosophy

- **Event-driven, not request-response.** Components react to NATS messages and Kubernetes events. No component calls another directly.
- **Chimps are cattle, not pets.** Ephemeral, disposable, spun up per-task. No precious state on the agent itself.
- **Pure core, effectful shell.** Ringmaster's decision logic is a pure function (`packages/ringmaster/src/core/core.ts`). Side effects (K8s API calls, Redis writes, NATS publishes) happen in the event handler that executes those decisions. This makes the core unit-testable without mocking infrastructure.
- **Extend through interfaces, not modification.** New AI backends, input sources, and output destinations plug in without changing existing code.

## Extension Points

Three seams where the system is designed to grow:

**Chimp Brains** — `ChimpBrain` abstract class in `packages/chimp/src/chimp-brain/chimp-brain.ts`. A brain handles incoming commands and publishes output. The Chimp class owns the NATS plumbing; the brain owns the work. Current implementations: Claude, Opencode, Echo.

**Usher Adapters** — `Adapter` interface in `packages/usher/src/adapters/types.ts`. An adapter translates an HTTP request into a chimp command and a target chimp ID. Current implementations: Slack, Debug.

**Bullhorn Handlers** — `OutputHandler` interface in `packages/bullhorn/handlers.ts`. A handler receives a chimp name and an output message, then does whatever it wants with them. Current implementations: ConsoleLogger.

## Ringmaster's Decision Model

The ringmaster's core is a pure function: given the current state and an event, it returns a list of actions to take. The event handler then executes those actions against real infrastructure.

This separation means the most complex logic in the system — "what should happen when a new message arrives and no chimp exists yet?" or "what should happen when a pod dies?" — can be tested with plain assertions, no mocks.

Event sources: NATS message listener (new work arrived) and Kubernetes pod watcher (lifecycle changes).

## Communication

Two NATS JetStream streams carry all inter-component messages:

- **Inputs stream** — commands flowing to chimps. Subject pattern: `chimps.inputs.<chimpId>`
- **Outputs stream** — messages flowing from chimps. Subject pattern: `chimps.outputs.<chimpId>`

Each chimp gets a dedicated consumer on the inputs stream, created by the ringmaster when work first arrives for that chimp ID.

JetStream over core NATS because: messages must survive chimp restarts, and new chimps need to replay messages that arrived before they existed.

### Subject Topology

Profile-based subjects partition chimps by configuration:

- `chimp.inputs.{profile}.{chimpId}` — inbound commands
- `chimp.outputs.{profile}.{chimpId}` — outbound messages
- `chimp.meta.{profile}.{chimpId}` — lifecycle meta events (spawned, output)

Legacy subjects `chimps.inputs.{chimpId}` and `chimps.outputs.{chimpId}` remain supported for back-compatibility.

### Chimp Profiles

A profile is a named preset defining brain, model, resources, env, and volumes for a chimp. Profiles are stored in a K8s ConfigMap `chimp-profiles` under key `profiles.json`, with fallback to the file at `CHIMP_PROFILES_PATH` or `/etc/circus/profiles.json`.

Default profile: brain=claude, model=haiku-4-5.

```json
{
  "default": { "brain": "claude", "model": "claude-haiku-4-5" },
  "fast": { "brain": "claude", "model": "claude-haiku-4-5" },
  "powerful": { "brain": "claude", "model": "claude-opus-4-5" }
}
```

### Meta Events

Lifecycle events emitted to `chimp.meta.{profile}.{chimpId}`:

- **spawned** — ringmaster creates a K8s job for the chimp
- **output** — bullhorn receives output from the chimp

Dashboard subscribes via SSE at `GET /api/meta/events`.

Naming conventions and stream configuration live in `packages/shared/src/standards/`.

## Chimp Lifecycle

1. Message arrives on the inputs stream for a chimp ID
2. Ringmaster's message listener detects it
3. Core logic decides: create a JetStream consumer + create a Kubernetes job
4. Event handler executes: consumer created, K8s job created
5. Pod starts, chimp process connects to NATS, begins consuming from its dedicated consumer
6. Chimp processes commands through its brain, publishes output to the outputs stream
7. Chimp finishes or is stopped, pod terminates
8. Ringmaster's pod watcher detects the termination
9. Core logic decides: clean up consumer + update state
10. Event handler executes: consumer deleted, Redis state updated

## State

Redis holds the ringmaster's view of each chimp: ID, status (pending/running/stopped/failed), and timestamps. This is the orchestrator's bookkeeping, not the agent's memory.

Chimps are stateless from the platform's perspective. A brain implementation may maintain its own session state (e.g., Claude conversation history), but that's internal to the brain, not visible to the platform.
