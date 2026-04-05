# chimp-protocol

Protocol validation and types for Chimp agents. This package provides Zod schemas and TypeScript types for validating messages sent to and from Chimp workers.

## Installation

```bash
bun add chimp-protocol
```

## Usage

### Initialization Configuration

The protocol supports initialization configuration via JSON files containing protocol messages to process before runtime.

```typescript
import {
  parseInitConfig,
  createInitConfig,
  createCloneRepoMessage,
  createSetWorkingDirMessage,
} from '@mnke/circus-protocol';

// Create an initialization config
const config = createInitConfig([
  createCloneRepoMessage('https://github.com/user/repo.git', 'main', '/workspace'),
  createSetWorkingDirMessage('/workspace/src'),
  createControlMessage('resume-session', { sessionId: 'abc-123' }),
  createAgentMessage('Familiarize yourself with the codebase'),
]);

// Save to file
await Bun.write('./chimp.config.json', JSON.stringify(config, null, 2));

// Load and validate config file
const fileData = await Bun.file('./chimp.config.json').json();
const validatedConfig = parseInitConfig(fileData);

// Process initialization messages
for (const message of validatedConfig.messages) {
  // Handle each message...
}
```

### Validating Messages

```typescript
import { parseChimpMessage, safeParseChimpMessage } from '@mnke/circus-protocol';

// Parse and validate (throws on error)
try {
  const message = parseChimpMessage(payload);
  // message is now typed as ChimpMessage
} catch (error) {
  console.error('Invalid message:', error);
}

// Safe parse (returns result object)
const result = safeParseChimpMessage(payload);
if (result.success) {
  const message = result.data;
  // message is now typed as ChimpMessage
} else {
  console.error('Validation errors:', result.error);
}
```

### Type Guards

```typescript
import { isAgentMessage } from '@mnke/circus-protocol';

const message = parseChimpMessage(payload);

if (isAgentMessage(message)) {
  // This is a send-agent-message command
  const prompt = extractPrompt(message);
  console.log('Agent prompt:', prompt);
} else {
  console.log('Command:', message.command);
}
```

### Creating Messages

```typescript
import {
  createAgentMessage,
  createMessage,
  createControlResponse,
  createErrorResponse,
} from '@mnke/circus-protocol';

// Create an agent message
const agentMsg = createAgentMessage('Analyze this code');

// Create other messages
const statusMsg = createMessage('get-status');
const resumeMsg = createMessage('resume-session', {
  sessionId: 'abc-123',
});

// Create responses
const successResponse = createControlResponse('running', {
  sessionId: 'abc-123',
  messageCount: 42,
});

const errorResponse = createErrorResponse('Session not found', {
  command: 'resume-session',
});
```

### Type Usage

```typescript
import type {
  ChimpMessage,
  ChimpResponse,
  ControlResponse,
  ErrorResponse,
} from '@mnke/circus-protocol';

function handleMessage(msg: ChimpMessage): ChimpResponse {
  if (isAgentMessage(msg)) {
    const prompt = extractPrompt(msg);
    // Process agent message...
    return 'Agent response text';
  } else {
    // Process other commands...
    return createControlResponse('success');
  }
}
```

## API Reference

### Schemas

- `ChimpMessageSchema` - Validates protocol messages with command and args
- `ControlResponseSchema` - Validates control command responses
- `ErrorResponseSchema` - Validates error responses
- `ChimpResponseSchema` - Union of all response types
- `InitConfigSchema` - Validates initialization configuration files

### Types

- `ChimpMessage` - Protocol message type (command + args)
- `AgentResponse` - Agent response type (string)
- `ControlResponse` - Control response type
- `ErrorResponse` - Error response type
- `ChimpResponse` - Union of all response types
- `InitConfig` - Initialization configuration type

### Functions

#### Validation

- `parseChimpMessage(payload)` - Parse and validate message (throws on error)
- `safeParseChimpMessage(payload)` - Safe parse message (returns result object)
- `parseInitConfig(config)` - Parse and validate init config (throws on error)
- `safeParseInitConfig(config)` - Safe parse init config (returns result object)

#### Type Guards

- `isAgentMessage(msg)` - Check if message is a send-agent-message command
- `isControlResponse(response)` - Check if response is a control response
- `isErrorResponse(response)` - Check if response is an error response

#### Message Creation Helpers

- `extractPrompt(msg)` - Extract prompt string from agent message
- `createAgentMessage(prompt)` - Create a send-agent-message command
- `createMessage(command, args?)` - Create a message with any command
- `createControlResponse(status, data?)` - Create a control response
- `createErrorResponse(error, data?)` - Create an error response
- `createInitConfig(messages)` - Create an initialization config

#### Initialization Message Helpers

- `createCloneRepoMessage(url, branch?, path?)` - Create clone-repo control message
- `createSetWorkingDirMessage(path)` - Create set-working-dir control message
- `createSetModelMessage(model)` - Create set-model control message
- `createSetAllowedToolsMessage(tools)` - Create set-allowed-tools control message

### Constants

- `PROTOCOL_VERSION` - Current protocol version (e.g., "1.0.0")

## Protocol Documentation

See [PROTOCOL.md](../../PROTOCOL.md) in the circus root for the complete protocol specification.

## License

See the main repository for license information.
