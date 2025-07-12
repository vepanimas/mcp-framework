# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

This is a TypeScript framework for building Model Context Protocol (MCP) servers. The framework provides:

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

### Transport Layer
The framework supports three transport mechanisms:
- **Stdio Transport** (default): Standard input/output for Claude Desktop integration
- **SSE Transport**: Server-sent events for web-based MCP clients
- **HTTP Stream Transport**: HTTP streaming with session management and batch processing

### Tool System
Tools use Zod schemas for input validation and automatic type inference:
- All tool schema fields must have descriptions (enforced at build time)
- Automatic JSON Schema generation from Zod schemas
- Type-safe input handling with `MCPInput<this>` type helper
- Built-in validation and error handling

### Loader System
The framework automatically discovers components from the filesystem:
- `ToolLoader`: Discovers and loads tools from tools/ directory
- `PromptLoader`: Discovers and loads prompts from prompts/ directory  
- `ResourceLoader`: Discovers and loads resources from resources/ directory

### Authentication (Optional)
For SSE and HTTP transports:
- JWT authentication via `JWTAuthProvider`
- API key authentication via `APIKeyAuthProvider`
- Custom authentication via `AuthProvider` interface

### CLI Framework
The CLI (`src/cli/`) provides:
- Project scaffolding and code generation
- Component addition (tools, prompts, resources)
- Build and validation commands
- Template management for rapid development

## Key Development Patterns

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
const server = new MCPServer();

// SSE with authentication
const server = new MCPServer({
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

### Requesting Feature Branch Work

When asking Claude Code to implement features, use this template:

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

### Example Feature Request

```
Create a feature branch called `feature/websocket-transport` and implement WebSocket transport support.

Requirements:
- Add WebSocket transport class extending AbstractTransport
- Support both client and server WebSocket connections
- Include proper error handling and reconnection logic
- Add configuration options for WebSocket-specific settings

When complete:
- Run tests and lint
- Commit with conventional commit format
- Push feature branch for PR review
```

## Testing Configuration

The project uses Jest with ESM support:
- Test files should be in `tests/**/*.test.ts`
- Uses ts-jest with ESM preset
- Coverage excludes CLI and index files
- Module mapping handles `.js` extensions in imports