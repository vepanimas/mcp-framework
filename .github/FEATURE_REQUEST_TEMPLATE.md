# Feature Request Template for Claude Code

Use this template when requesting Claude Code to implement new features:

## Basic Template

```
Create a feature branch called `feature/[descriptive-name]` and implement [feature description].

Requirements:
- [List specific requirements]
- [Any constraints or considerations]
- [Testing requirements]

When complete:
- Run tests and lint
- Commit with conventional commit format
- Push feature branch
- Do not merge to main
```

## Detailed Template

```
Create a feature branch called `feature/[descriptive-name]` and implement [feature description].

## Context
[Why is this feature needed? What problem does it solve?]

## Requirements
- [Functional requirement 1]
- [Functional requirement 2]
- [Performance requirements]
- [Compatibility requirements]

## Technical Specifications
- [Architecture considerations]
- [APIs to implement]
- [Files to modify/create]
- [Dependencies to add]

## Testing Requirements
- [Unit tests needed]
- [Integration tests needed]
- [Manual testing steps]

## Documentation
- [Update CLAUDE.md if needed]
- [Update ARCHITECTURE.md if needed]
- [Add inline code documentation]

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] All tests pass
- [ ] Code passes linting
- [ ] Documentation updated

When complete:
- Run `npm test && npm run lint`
- Commit with conventional commit format (feat:, fix:, docs:, etc.)
- Push feature branch to origin
- Do not merge to main - create PR for review
```

## Example Requests

### Simple Feature
```
Create a feature branch called `feature/add-debug-logging` and add debug logging to the tool validation system.

Requirements:
- Add debug logs to show which tools are being validated
- Log validation errors with more context
- Use existing logger from core/Logger.ts

When complete:
- Run tests and lint
- Commit with conventional commit format
- Push feature branch
```

### Complex Feature
```
Create a feature branch called `feature/websocket-transport` and implement WebSocket transport support.

## Context
Users need real-time bidirectional communication for streaming responses and live data updates.

## Requirements
- Add WebSocket transport class extending AbstractTransport
- Support both client and server WebSocket connections
- Include proper error handling and reconnection logic
- Add configuration options for WebSocket-specific settings
- Maintain compatibility with existing transport interface

## Technical Specifications
- Create `src/transports/websocket/server.ts`
- Add WebSocket configuration types in `src/transports/websocket/types.ts`
- Update `src/core/MCPServer.ts` to support websocket transport type
- Add WebSocket dependencies to package.json

## Testing Requirements
- Unit tests for WebSocket transport class
- Integration tests with mock WebSocket connections
- Test error handling and reconnection scenarios

## Acceptance Criteria
- [ ] WebSocket transport implements AbstractTransport interface
- [ ] Supports bidirectional message passing
- [ ] Handles connection errors gracefully
- [ ] Includes reconnection logic with backoff
- [ ] Configuration options work correctly
- [ ] All tests pass
- [ ] Documentation updated

When complete:
- Run `npm test && npm run lint`
- Commit with conventional commit format
- Push feature branch for PR review
```