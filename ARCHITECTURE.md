# Circus Architecture

## Overview

Circus is an event-driven platform for managing AI agents ("Chimps") at scale. It uses Redis for state management, NATS JetStream for durable messaging, and Kubernetes for container orchestration. The architecture is designed for sub-second response times, automatic scaling, and high availability.

## Components

### 1. Usher (Event Correlator)
**Purpose:** Routes external events to appropriate Chimp sessions

**Responsibilities:**
- Receives webhooks from external sources (Slack, GitHub, Discord, Jira)
- Correlates events to sessions using Redis lookups (<50ms)
- Publishes messages directly to NATS subjects
- Maintains session state in Redis
- **Ensures NATS streams exist before publishing** (idempotent stream/consumer creation)
- **Subscribes to correlation events from Chimps to update Redis indexes**

**Flow:**
```
Webhook → Normalize Event → Correlate to Session → Ensure Stream → Publish to NATS

[Parallel] Chimp publishes correlation event → Usher updates Redis indexes
```

**Note on Stream Creation:** Currently, Usher creates streams/consumers idempotently before publishing messages. This ensures immediate message delivery without waiting for Ringmaster. In future iterations, stream creation may move entirely to Ringmaster's message listener.

### 2. Ringmaster (Lifecycle Manager)
**Purpose:** Manages Chimp pod and stream lifecycle

**Responsibilities:**
- **Watches Kubernetes pod events (real-time pod lifecycle awareness)**
- **Listens to NATS for incoming messages (event-driven creation)**
- Watches Redis for new sessions (reconciliation loop)
- Creates NATS JetStream streams (idempotent)
- Creates Kubernetes pods (idempotent)
- **Subscribes to heartbeat events from Chimps and updates Redis**
- Monitors chimp health via Redis heartbeats
- Reconciliation loop to recover from failures

**Flow (Triple-Mode Operation):**
```
[Fastest Path] K8s Pod Event (MODIFIED/DELETED) → Immediate reaction (< 1s)
  - Pod fails → Clear health → Recreate immediately
  - Pod starts → Set initial health

[Fast Path] NATS message → Check Chimp Health → Create Pod + Stream if needed (< 1s)
  - Message arrives → Trigger Chimp creation if not running

[Slow Path] Watch Redis Sessions → Check Chimp Health → Create Pod + Stream if needed (30s)
  - Reconciliation loop as safety net

[Parallel] Chimp publishes heartbeat → Ringmaster updates Redis health
```

### 3. Chimp (Worker)
**Purpose:** Processes messages using AI Agent SDK

**Responsibilities:**
- Connects to NATS JetStream as durable consumer
- Processes messages with AI Agent
- Publishes responses to `chimp.{chimpName}.output`
- **Publishes periodic heartbeat events to NATS (every 10s)**
- **Publishes correlation events when creating external resources** (PRs, issues, threads)
- **Publishes completion event when shutting down** (idle timeout or explicit stop)
- **Implements idle timeout** (30 minutes default)

**Flow:**
```
Pull from NATS → Process with AI Agent → Publish Response to chimp.{chimpName}.output
                                       ↓
                      Publish Heartbeat Events (every 10s)
                                       ↓
                      Publish Correlation Events (when creating PRs, issues, etc.)
                                       ↓
                      Idle Timeout (30min) → Publish Completion Event → Exit
```

### 4. Bullhorn (Output Handler)
**Purpose:** Processes chimp output messages and sends them to external services

**Responsibilities:**
- Subscribes to `chimp.*.output` on NATS
- Validates output messages using protocol schemas
- Routes messages to appropriate handlers (Slack, GitHub, Discord, console)
- Extensible handler architecture for future integrations

**Flow:**
```
Subscribe to chimp.*.output → Parse & Validate Message → Route to Handlers
                                                         ↓
                                          [ConsoleLogger, SlackHandler, GitHubHandler, ...]
```

**Current Implementation:**
- **ConsoleLoggerHandler**: Logs all chimp output messages using Pino logger
- Future handlers: Slack message sender, GitHub comment creator, Discord webhook, etc.

## Data Stores

### Redis

**Session State** (from Usher)
```
session:{chimpName} → {
  chimpName: string
  source: "slack" | "github" | "discord" | "jira"
  identifiers: {...}
  userId: string
  createdAt: number
  lastActivityAt: number
  state: "active" | "idle"
}
TTL: 30 minutes
```

**Chimp State** (from Ringmaster)
```
chimp:{chimpName} → {
  chimpName: string
  podName: string
  streamName: string
  createdAt: number
  status: "pending" | "running" | "failed"
}
No TTL (persistent)
```

**Chimp Health** (from Ringmaster, based on heartbeat events)
```
chimp:{chimpName}:health → {
  lastHeartbeat: number
  messageCount: number
}
TTL: 30 seconds
```

**Correlation Indexes** (from Usher, updated by Chimp correlation events)
```
slack:channel:{channelId} → {chimpName}
slack:thread:{threadTs} → {chimpName}
github:pr:{repo}:{prNumber} → {chimpName}
github:issue:{repo}:{issueNumber} → {chimpName}
jira:issue:{issueKey} → {chimpName}
discord:channel:{channelId} → {chimpName}
discord:thread:{threadId} → {chimpName}
user:recent:{userId} → {chimpName}
TTL: 30 minutes (refreshed on activity)
```

### NATS JetStream

**Streams** (one per Chimp)
```
Name: chimp-{chimpName}
Subjects:
  - chimp.{chimpName}.input       # User messages to Chimp
  - chimp.{chimpName}.output      # Chimp responses
  - chimp.{chimpName}.control     # Control messages (completion events)
  - chimp.{chimpName}.correlation # Correlation events from Chimp
  - chimp.{chimpName}.heartbeat   # Heartbeat events from Chimp
Retention: Limits (7 days, 100k messages)
Storage: File
```

**Consumers** (one per Chimp)
```
Name: chimp-{chimpName}-consumer
Durable: true
AckPolicy: Explicit
FilterSubject: chimp.{chimpName}.input
```

## Naming Conventions

All names derived from `chimpName` (which equals session exchange name):

```typescript
streamName:          `chimp-${chimpName}`
inputSubject:        `chimp.${chimpName}.input`
outputSubject:       `chimp.${chimpName}.output`
controlSubject:      `chimp.${chimpName}.control`
correlationSubject:  `chimp.${chimpName}.correlation`
heartbeatSubject:    `chimp.${chimpName}.heartbeat`
podName:             `chimp-${chimpName}`
consumerName:        `chimp-${chimpName}-consumer`
```

## Message Flow

### 1. External Event → Chimp

```
1. External Event (e.g., Slack message)
   ↓
2. Usher receives webhook
   ↓
3. Usher correlates to session (Redis lookup <50ms)
   ↓
4. Usher publishes to NATS: chimp.{chimpName}.input
   ↓
5. [Event-Driven] Ringmaster receives message notification from NATS
   ↓
6. Ringmaster checks chimp health in Redis
   ↓
7. If unhealthy/missing: Create pod + stream (idempotent)
   ↓
8. Chimp pod starts, connects to NATS
   ↓
9. Chimp pulls message from stream
   ↓
10. Chimp processes with AI Agent
    ↓
11. Chimp publishes response to chimp.{chimpName}.output
```

**Key Insight:** Steps 2-4 happen immediately (<100ms). Steps 5-7 happen event-driven (<1s). Steps 8-11 happen asynchronously. NATS buffers messages until Chimp is ready.

**Triple-Mode Operation:**
- **Fastest Path (Pod Events):** Ringmaster watches Kubernetes pod events and reacts immediately to pod failures/starts (<1s)
- **Fast Path (NATS Messages):** Ringmaster listens to `chimp.*.input` on NATS and immediately creates Chimps when messages arrive (<1s)
- **Slow Path (Reconciliation):** Every 30s, Ringmaster scans Redis sessions to ensure all Chimps are healthy (safety net)

### 2. Bidirectional Correlation (Chimp → External Resources)

**Scenario:** User asks Chimp on Slack to create a GitHub PR, then comments on that PR on GitHub.

```
1. User on Slack: "@chimp create a PR to fix login bug"
   ↓
2. Usher correlates to session (e.g., via slack:channel:C12345)
   ↓
3. Chimp processes request and creates PR myorg/myrepo#123
   ↓
4. Chimp publishes correlation event to chimp.{chimpName}.correlation:
   {
     type: "github-pr",
     repo: "myorg/myrepo",
     prNumber: 123,
     sessionName: "{chimpName}"
   }
   ↓
5. Usher (subscribed to chimp.*.correlation) receives event
   ↓
6. Usher updates Redis:
   SET github:pr:myorg/myrepo:123 = {chimpName}
   EXPIRE github:pr:myorg/myrepo:123 1800  # 30 min TTL
   ↓
7. [Later] User comments on GitHub PR #123
   ↓
8. Usher receives GitHub webhook
   ↓
9. Usher checks Redis: github:pr:myorg/myrepo:123 → {chimpName}
   ↓
10. Usher publishes to correct chimp.{chimpName}.input
```

**Correlation Event Types:**
```typescript
type CorrelationEvent =
  | { type: "github-pr", repo: string, prNumber: number }
  | { type: "github-issue", repo: string, issueNumber: number }
  | { type: "jira-issue", issueKey: string }
  | { type: "slack-thread", channelId: string, threadTs: string }
  | { type: "discord-thread", channelId: string, threadId: string }
```

**Implementation Note:** The exact mechanism for how Chimps detect and publish these events is TBD. Options include:
- Tool wrappers that auto-publish correlation events
- Manual API calls in Chimp code
- Post-processing of tool outputs

### 3. Chimp Health Monitoring

```
Every 10 seconds:
  Chimp → Publish heartbeat to chimp.{chimpName}.heartbeat
  Ringmaster (subscribed to chimp.*.heartbeat) → Update Redis (chimp:{name}:health, TTL=30s)

Every 30 seconds (Ringmaster reconciliation):
  For each session in Redis:
    Check chimp:{name}:health
    If missing or expired:
      Check if pod creation pending
      If not pending: Create pod + stream
```

**Heartbeat Event Format:**
```typescript
{
  chimpName: string;
  timestamp: number;
  messageCount: number;
}
```

### 4. Failure Recovery

**Scenario: Chimp dies (with Pod Watcher)**
```
t=0:  Chimp sends last heartbeat
t=10: Chimp dies (no more heartbeats)
t=11: Kubernetes detects pod failure (CrashLoopBackOff, Failed, etc.)
t=11: Ringmaster PodWatcher receives MODIFIED event
t=11: Ringmaster clears health and triggers immediate recreation
t=12: New pod creation starts
t=40: New pod starts, connects to NATS
t=41: New pod processes buffered messages
```

**Recovery time with Pod Watcher:** ~30 seconds (immediate detection + pod startup time)
**Fallback recovery time (if watcher fails):** 60 seconds (30s TTL + 30s reconcile interval)
**Messages:** Safe in NATS JetStream during recovery

**Benefits of Pod Watcher:**
- 2x faster recovery (30s vs 60s)
- Immediate awareness of pod failures
- No dependency on heartbeat TTL expiration
- Reconciliation loop becomes true safety net

## Performance Targets

| Operation | Target | Typical |
|-----------|--------|---------|
| Event correlation | <50ms | 10-20ms |
| Message publish | <100ms | 20-30ms |
| Total Usher latency | <1s | 100-200ms |
| Chimp creation | N/A (async) | 30-60s |
| Failure recovery | <60s | 30-45s |

## Benefits of Exchange-Free Architecture

### 1. **Simpler**
- No CRD operator to maintain
- No reconciliation loops for Exchange resources
- Direct pod + stream management

### 2. **Faster**
- No K8s API calls in hot path
- Direct NATS publish (no Exchange lookup)
- Redis for fast state checks

### 3. **More Scalable**
- Redis handles hundreds of lookups/sec
- K8s API not in critical path
- NATS handles message buffering

### 4. **Still Reliable**
- NATS JetStream durability
- Redis TTL for health
- Reconciliation loop as safety net
- Idempotent pod/stream creation

## Chimp Lifecycle

Chimps are **ephemeral** - they run on-demand and shut down when idle to conserve resources.

### Lifecycle States

```
[Creation] → [Running] → [Idle] → [Completion] → [Cleanup]
```

**1. Creation (On-Demand)**
- Triggered by: Incoming message to `chimp.{chimpName}.input`
- Ringmaster detects message via NATS listener
- Ringmaster creates: NATS stream + consumer + Kubernetes pod
- Pod startup time: ~30 seconds

**2. Running**
- Chimp processes messages from JetStream
- Publishes heartbeats every 10 seconds
- Publishes correlation events when creating resources
- Idle timer resets on each incoming message

**3. Idle Detection**
- After **30 minutes** (default) of no messages:
  - Chimp publishes completion event to `chimp.{chimpName}.control`
  - Chimp stops heartbeats
  - Chimp closes NATS connection and exits

**4. Completion Event**
```json
{
  "type": "completion",
  "chimpName": "slack-C123-T456",
  "timestamp": 1234567890000,
  "reason": "idle_timeout",
  "messageCount": 42,
  "sessionId": "session-123"
}
```

Reasons: `"idle_timeout"`, `"explicit_stop"`, `"error"`

**5. Cleanup**
- Ringmaster receives completion event
- Ringmaster deletes pod immediately
- Ringmaster updates Redis state
- NATS stream remains (messages buffered for recreation)

### Idle Timeout Configuration

Configurable via environment variable:
- `IDLE_TIMEOUT_MS`: Milliseconds of inactivity before shutdown (default: 1800000 = 30 minutes)

### Benefits

- **Resource Efficiency**: Idle Chimps don't waste CPU/memory
- **Cost Savings**: Only pay for active compute time
- **Fast Recovery**: Messages buffered in NATS during downtime
- **Automatic Scaling**: Chimps auto-create and auto-destroy based on demand

## Horizontal Scaling

Ringmaster supports **horizontal scaling** with multiple replicas (e.g., 3 replicas) running concurrently without coordination.

### Design Principles

**No coordination required** - Ringmaster replicas operate independently without locks or leader election:
- NATS queue groups for load balancing
- Idempotent resource creation for race condition handling
- Redundant reconciliation loops as safety nets

### NATS Queue Groups

All NATS subscriptions use the `"ringmaster"` queue group, ensuring only ONE replica processes each event:

```typescript
// Message detection (incoming messages trigger Chimp creation)
nc.subscribe("chimp.*.input", { queue: "ringmaster" })

// Heartbeat processing (updates Redis health)
nc.subscribe("chimp.*.heartbeat", { queue: "ringmaster" })

// Completion handling (cleanup on Chimp shutdown)
nc.subscribe("chimp.*.control", { queue: "ringmaster" })
```

**Benefits:**
- Load balancing: Events distributed across replicas
- No duplication: Each event processed exactly once
- Automatic failover: If one replica dies, others take over
- No coordination overhead: NATS handles distribution

### Idempotent Operations

All resource creation operations are idempotent - they check if resources exist before creating:

**Pod Creation** (packages/ringmaster/pod-manager.ts:29-105)
```typescript
async createPod(chimpName: string): Promise<void> {
  // Check if pod already exists
  try {
    await this.k8sApi.readNamespacedPod({ name: podName, namespace });
    return; // Already exists
  } catch (error) {
    if (error.code !== 404) throw error;
  }

  // Create pod
  try {
    await this.k8sApi.createNamespacedPod({ namespace, body: pod });
  } catch (error) {
    // Handle race condition - another replica may have created it
    if (error.code === 409) return; // Already exists
    throw error;
  }
}
```

**Stream Creation** (similar pattern - check existence, handle conflicts)

**Benefits:**
- Race conditions are safe: Multiple replicas can try to create the same resource
- No locks needed: Kubernetes/NATS APIs handle conflicts gracefully
- No deadlocks: No distributed locking to fail or timeout

### Reconciliation Loop

The reconciliation loop runs on **all replicas** concurrently (every 30 seconds):

```typescript
// All replicas scan Redis sessions
for (const sessionKey of sessionKeys) {
  const chimpName = sessionKey.replace("session:", "");
  await this.reconcileChimp(chimpName);
}
```

**Why this is safe:**
- Reconciliation checks health before acting (Redis health with TTL)
- ensureChimpExists() uses idempotent operations
- Worst case: Multiple replicas try to create the same pod (409 conflict, handled gracefully)
- Best case: Health is good, reconciliation is a no-op

**Why no leader election:**
- Reconciliation is a **safety net**, not the primary mechanism
- Event-driven paths (NATS messages, pod events) are the fast path
- Redundant reconciliation is acceptable - it's just health checks
- Leader election adds complexity (deadlocks, split-brain scenarios)

### Pod Watcher

Kubernetes pod events are **broadcast to all replicas**:

```typescript
// All replicas watch pod events
await this.watch.watch(path, queryParams, async (type, apiObj) => {
  await this.handlePodEvent(type, apiObj);
});
```

**Why this is safe:**
- handlePodFailed() calls ensureChimpExists() which is idempotent
- Multiple replicas detecting the same failure will race to recreate
- One will succeed (201), others will get 409 conflict (already exists)

### Scaling Configuration

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ringmaster
spec:
  replicas: 3  # ← Run 3 replicas for high availability
  selector:
    matchLabels:
      app: ringmaster
  template:
    # ... pod spec
```

**Recommended replica count:**
- Development: 1 replica
- Staging: 2 replicas
- Production: 3 replicas (can handle 2 failures)

### Benefits

- **High Availability**: Failure of 1-2 replicas doesn't impact system
- **Load Balancing**: NATS queue groups distribute work automatically
- **No Coordination Overhead**: No Redis locks, no leader election, no consensus
- **Simple Operations**: Deploy/scale like any stateless service
- **No Deadlocks**: No distributed locking to fail or timeout
- **Graceful Degradation**: System continues with reduced replica count

## Open Questions

1. **Stream cleanup:** When to delete NATS streams?
   - Option A: Never (retention policy handles it)
   - Option B: When session deleted
   - **Current**: Never - streams persist for message buffering

2. **Multi-tenancy:** How to isolate chimps across teams?
   - Option A: Kubernetes namespaces
   - Option B: Redis key prefixes
   - Option C: Both

3. **Observability:** How to expose chimp metrics?
   - Option A: Redis state (queryable)
   - Option B: Prometheus metrics from Ringmaster
   - Option C: Both
