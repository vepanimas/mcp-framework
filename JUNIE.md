# JUNIE.md

This file provides guidance to Junie (JetBrains' autonomous programmer) when working with code in this repository.

## Repository Overview

The MCP Framework is a TypeScript framework for building Model Context Protocol (MCP) servers. It provides:

- Auto-discovery of tools, prompts, and resources
- Type-safe tool development with Zod schema validation
- Multiple transport layers (stdio, SSE, HTTP streaming)
- Comprehensive validation at development, build, and runtime
- CLI for project scaffolding and component generation

### Model Context Protocol (MCP) Overview

MCP provides a standardized way for applications to:
- Share contextual information with language models
- Expose tools and capabilities to AI systems
- Build composable integrations and workflows

The protocol uses JSON-RPC 2.0 messages to establish communication between:
- **Hosts**: LLM applications that initiate connections
- **Clients**: Connectors within the host application
- **Servers**: Services that provide context and capabilities

MCP takes inspiration from the Language Server Protocol, standardizing how to integrate additional context and tools into the ecosystem of AI applications.

#### Key Protocol Details
- JSON-RPC message format
- Stateful connections
- Server and client capability negotiation

#### Core Features
Servers offer any of the following features to clients:
- **Resources**: Context and data, for the user or the AI model to use
- **Prompts**: Templated messages and workflows for users
- **Tools**: Functions for the AI model to execute

### Important Usage Note
The mcp-framework is used exclusively as a dependency in other repositories - similar to how Express.js would be used. This means that it runs from node_modules within the repo, which impacts how relative directories work.

## Common Development Commands

### Building and Compiling
- `npm run build` - Compile TypeScript to JavaScript with automatic tool validation
- `npm run watch` - Watch mode compilation for development
- `mcp-build` - Framework-specific build command that validates MCP dependencies

### Code Quality
- `npm run lint` - Run ESLint on the codebase
- `npm run lint:fix` - Run ESLint with automatic fixes
- `npm run format` - Format code using Prettier

### Testing
- `npm test` - Run tests using Jest with ESM support
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### MCP-Specific Commands
- `mcp create <project-name>` - Create new MCP server project
- `mcp add tool <tool-name>` - Add a new tool to the project
- `mcp add prompt <prompt-name>` - Add a new prompt to the project
- `mcp add resource <resource-name>` - Add a new resource to the project
- `mcp validate` - Validate tool schemas have proper descriptions

## Architecture Overview

### Core Components

**MCPServer** (`src/core/MCPServer.ts`): The main server class that orchestrates everything. It:
- Auto-discovers and loads tools, prompts, and resources from the filesystem
- Supports multiple transport layers (stdio, SSE, HTTP streaming)
- Handles MCP protocol compliance and request routing
- Manages server lifecycle and graceful shutdown

**Base Classes**:
- `MCPTool` (`src/tools/BaseTool.ts`): Base class for tools with Zod schema validation
- `BasePrompt` (`src/prompts/BasePrompt.ts`): Base class for prompts
- `BaseResource` (`src/resources/BaseResource.ts`): Base class for resources

### Auto-Discovery System

The framework's auto-discovery system is built on:

**File Discovery Engine** (`src/utils/fileDiscovery.ts`):
- Recursively traverses the filesystem to find MCP components
- Supports glob-style exclusion patterns
- Smart path resolution between development and production environments

**BaseLoader Pattern** (`src/loaders/BaseLoader.ts`):
- Abstract factory pattern for loading and validating components
- Specialized loaders for tools, prompts, and resources
- Type-safe component instantiation with error handling

### Zod Integration and Schema System

The framework uses Zod for schema validation:
- Converts Zod schemas to JSON Schema for MCP protocol compliance
- Enforces descriptions for all schema fields
- Provides automatic type inference for tool inputs
- Implements multi-level validation (development, build, startup, runtime)

### Transport Layer

The framework supports three transport mechanisms:
- **Stdio Transport** (default): Standard input/output for Claude Desktop integration
- **SSE Transport**: Server-sent events for web-based MCP clients
- **HTTP Stream Transport**: HTTP streaming with session management and batch processing

### CLI and Code Generation

The CLI provides:
- Project scaffolding and code generation
- Component addition (tools, prompts, resources)
- Build and validation commands
- Template management for rapid development

## Key Development Patterns

### Complete MCP Server Example

Here's a complete example of how to create an MCP server using the framework:

#### Tool Implementation (src/tools/ExampleTool.ts)

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ExampleInput {
  message: string;
}

class ExampleTool extends MCPTool<ExampleInput> {
  name = "example_tool";
  description = "An example tool that processes messages";
  
  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ExampleInput) {
    return `Processed: ${input.message}`;
  }
}

export default ExampleTool;
```

#### Server Setup (src/index.ts)

```typescript
import { MCPServer } from "mcp-framework";

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 1337,
      cors: {
        allowOrigin: "*"
      }
    }
  }
});

server.start();
```

#### Package Configuration (package.json)

```json
{
  "name": "example-mcp-server",
  "version": "0.0.1",
  "description": "Example MCP server",
  "type": "module",
  "bin": {
    "example-mcp-server": "./dist/index.js"
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc && mcp-build",
    "watch": "tsc --watch",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "mcp-framework": "^0.2.15",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.17.28",
    "typescript": "^5.3.3"
  },
  "engines": {
    "node": ">=18.19.0"
  }
}
```

### Creating Tools

Tools must extend `MCPTool` and define a Zod schema with descriptions:

```typescript
class MyTool extends MCPTool {
  name = "my_tool";
  description = "Tool description";
  schema = z.object({
    input: z.string().describe("Input parameter description")
  });

  async execute(input: MCPInput<this>) {
    // input is fully typed from the schema
    return input.input;
  }
}
```

### Tool Validation

The framework enforces that all Zod schema fields have descriptions:
- Build-time validation via `npm run build`
- Development-time validation via `defineSchema()` helper
- Runtime validation during server startup
- Standalone validation via `mcp validate`

### Transport Configuration

Server transport is configured during instantiation:

```typescript
// Stdio (default)
const stdioServer = new MCPServer();

// SSE with authentication
const sseServer = new MCPServer({
  transport: {
    type: "sse",
    options: { port: 8080, auth: { provider: authProvider } }
  }
});
```

## Environment Variables

- `MCP_ENABLE_FILE_LOGGING` - Enable file logging (default: false)
- `MCP_LOG_DIRECTORY` - Log file directory (default: logs)
- `MCP_DEBUG_CONSOLE` - Show debug messages in console (default: false)
- `MCP_SKIP_TOOL_VALIDATION` - Skip tool validation during build (not recommended)

## File Structure Patterns

The framework expects a specific directory structure:
- `tools/` - Tool implementations (auto-discovered)
- `prompts/` - Prompt implementations (auto-discovered)
- `resources/` - Resource implementations (auto-discovered)
- `dist/` - Compiled JavaScript output
- `src/` - TypeScript source code
- `index.ts` - Main server entry point

## Git Workflow and Branching Strategy

**IMPORTANT**: This repository uses a feature branch workflow. Always work on feature branches, never directly on `main`.

### Feature Branch Workflow

1. **Create a feature branch** before starting any work:
   ```bash
   git checkout -b feature/descriptive-feature-name
   ```

2. **Branch naming conventions**:
   - `feature/new-tool-system` - For new features
   - `fix/validation-bug` - For bug fixes
   - `docs/update-readme` - For documentation
   - `refactor/loader-system` - For refactoring

3. **Development process**:
   ```bash
   # Start feature branch
   git checkout -b feature/my-new-feature
   
   # Make changes and commit
   git add .
   git commit -m "feat: implement new feature"
   
   # Push feature branch
   git push origin feature/my-new-feature
   
   # Create pull request on GitHub for review
   ```

4. **Never push directly to main**:
   - All changes must go through pull requests
   - Feature branches should be merged via GitHub PRs
   - Delete feature branches after merging

## Feature Request Template

When implementing features, follow this template:

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
- [Update JUNIE.md if needed]
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

## Performance and Optimization Considerations

### Memory Management
- Use Maps for O(1) component lookup
- Implement lazy loading of components
- Cache capability detection results

### Filesystem Optimization
- Use priority-based path checking
- Cache resolved module paths
- Implement early returns in directory traversal

### Network Optimization
- Use connection pooling for SSE transport
- Configure batch timeouts for HTTP streaming
- Implement intelligent ping/keepalive intervals

## Error Handling Strategy

### Layered Error Handling
- Component Level: Validation errors with specific field information
- Transport Level: Connection error recovery and protocol-specific error formatting
- Server Level: Centralized error logging with context

### Development vs Production
- Development Mode: Verbose error messages with stack traces
- Production Mode: Sanitized error messages and comprehensive logging

## Security Considerations

### Input Validation
- Implement schema validation at component definition time
- Use runtime input validation with Zod
- Ensure type safety through TypeScript compilation

### Authentication Integration
- Support JWT and API Key authentication
- Implement custom authentication provider interface
- Configure per-endpoint authentication

### Transport Security
- Configure CORS for web clients
- Implement request size limiting
- Manage sessions for HTTP transports

## Extension Points

### Custom Transports
Implement `AbstractTransport` to add new communication protocols:
```typescript
class CustomTransport extends AbstractTransport {
  readonly type = "custom";
  // Implement required methods
}
```

### Custom Authentication
Implement `AuthProvider` interface for custom authentication:
```typescript
class CustomAuthProvider implements AuthProvider {
  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    // Custom authentication logic
  }
}
```

### Custom Loaders
Extend `BaseLoader` for custom component types:
```typescript
class CustomLoader extends BaseLoader<CustomComponent> {
  // Implement validation and instantiation
}
```

## Testing Configuration

The project uses Jest with ESM support:
- Test files should be in `tests/**/*.test.ts`
- Uses ts-jest with ESM preset
- Coverage excludes CLI and index files
- Module mapping handles `.js` extensions in imports

## Junie-Specific Guidelines

When working with this repository as Junie:

1. **Always follow the feature branch workflow** - Never commit directly to main
2. **Validate tool schemas** - Ensure all schema fields have descriptions
3. **Run tests before submitting changes** - Use `npm test && npm run lint`
4. **Document architectural changes** - Update ARCHITECTURE.md for significant changes
5. **Use type-safe patterns** - Leverage TypeScript and Zod for type safety
6. **Follow existing patterns** - Maintain consistency with the codebase
7. **Consider extension points** - Use the framework's extension mechanisms
8. **Optimize for performance** - Follow the performance optimization strategies
9. **Implement proper error handling** - Use the layered error handling approach
10. **Consider security implications** - Follow the security considerations

## Conclusion

The MCP Framework is a sophisticated TypeScript framework with a focus on developer experience, production readiness, extensibility, and maintainability. When working with this codebase, prioritize these aspects while following the established patterns and workflows.
