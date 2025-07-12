# MCP Framework v2.0 Architecture

This document describes the modernized architecture of the MCP Framework v2.0, which provides a standards-compliant wrapper around the official MCP TypeScript SDK.

## Design Philosophy

### Standards-First Approach
The v2.0 architecture prioritizes **100% compliance** with the official MCP SDK:
- Uses `McpServer` class from `@modelcontextprotocol/sdk`
- Leverages official registration methods (`registerTool()`, `registerPrompt()`, `registerResource()`)
- Direct transport usage without custom abstraction layers
- Minimal wrapper that adds value without complexity

### Simplicity Over Magic
- **No auto-discovery**: Explicit registration for predictable behavior
- **Single file pattern**: All components defined in one place
- **Direct API**: No hidden abstractions or complex inheritance hierarchies
- **Immediate feedback**: Errors surface quickly during development

## Core Architecture

### MCPServer Class (`src/core/ModernMCPServer.ts`)

The `MCPServer` class is a lightweight wrapper around the official SDK's `McpServer`:

```typescript
export class MCPServer {
  private mcpServer: McpServer;  // Official SDK server
  
  constructor(config: MCPServerConfig) {
    this.mcpServer = new McpServer({
      name: config.name || this.getDefaultName(),
      version: config.version || this.getDefaultVersion()
    });
  }
}
```

#### Key Design Decisions:

1. **Composition over Inheritance**: Wraps the official SDK rather than extending it
2. **Fluent Interface**: Methods return `this` for chaining
3. **Minimal Configuration**: Sensible defaults with optional overrides
4. **Type Safety**: Full TypeScript support with Zod schema integration

### Registration Methods

The framework provides three registration methods that map directly to SDK APIs:

#### Tool Registration
```typescript
addTool(name: string, description: string, schema: z.ZodType, handler: ToolHandler): this
```

**Implementation**:
```typescript
addTool(name, description, schema, handler) {
  this.mcpServer.registerTool(name, {
    title: name,
    description,
    inputSchema: schema
  }, handler);
  return this;
}
```

#### Prompt Registration
```typescript
addPrompt(name: string, description: string, schema: z.ZodType, handler: PromptHandler): this
```

#### Resource Registration
```typescript
addResource(name: string, template: string, description: string, handler: ResourceHandler): this
```

### Transport Layer

The transport layer uses official SDK transports directly:

```typescript
private createTransport() {
  switch (this.config.transport) {
    case 'http':
      return new StreamableHTTPServerTransport({ port: this.config.port! });
    case 'stdio':
    default:
      return new StdioServerTransport();
  }
}
```

**No Custom Abstraction**: Unlike v1.x, there's no custom transport wrapper. This eliminates complexity and ensures compatibility with SDK updates.

## Schema System

### Zod Integration

The framework uses Zod for schema definition and validation:

```typescript
const schema = z.object({
  name: z.string().describe('Parameter description'),
  age: z.number().optional().describe('Optional parameter')
});
```

**Type Inference**: TypeScript automatically infers handler input types from Zod schemas, eliminating duplicate type definitions.

### Validation Flow

1. **Schema Definition**: Developer defines Zod schema with `.describe()` calls
2. **Automatic Validation**: SDK validates inputs against schema
3. **Type Safety**: TypeScript ensures handler matches schema types
4. **Runtime Safety**: Zod catches invalid inputs at runtime

## Project Structure

### Minimal File Organization

Modern projects use a **single file pattern**:

```
my-project/
├── src/
│   └── index.ts          # All registrations in one file
├── package.json          # Minimal dependencies
├── tsconfig.json         # Standard TypeScript config
└── README.md            # Project documentation
```

### Single File Pattern Benefits

1. **Clarity**: All components visible in one place
2. **Simplicity**: No file discovery or complex module loading
3. **IDE-Friendly**: Perfect for programmatic code generation
4. **Debugging**: Easy to understand component relationships

## CLI Architecture

### Project Generation (`src/cli/project/create.ts`)

The CLI generates complete, working projects:

```typescript
export async function createProject(name?: string, options?: ProjectOptions) {
  // 1. Create project structure
  // 2. Generate package.json with minimal dependencies  
  // 3. Create tsconfig.json with standard settings
  // 4. Generate src/index.ts with example tools
  // 5. Install dependencies and build project
}
```

**Generated Template**:
```typescript
import { MCPServer, z } from 'mcp-framework';

const server = new MCPServer({
  name: 'project-name',
  version: '1.0.0'
});

server
  .addTool('hello', 'Say hello', schema, handler)
  .addTool('add', 'Add numbers', schema, handler)
  .start();
```

### Build System (`src/cli/framework/build.ts`)

Simplified build process:
```typescript
export async function buildFramework() {
  // Just run TypeScript compiler - no complex validation
  await execa('npx', ['tsc'], { stdio: 'inherit' });
}
```

## Error Handling Strategy

### Fail-Fast Philosophy

1. **Configuration Errors**: Invalid config throws immediately
2. **Schema Errors**: Zod validation fails fast with clear messages
3. **Transport Errors**: SDK handles connection issues gracefully
4. **Runtime Errors**: Tools can return error content in responses

### Error Response Pattern

```typescript
server.addTool('risky-tool', 'Description', schema, async (input) => {
  try {
    const result = await riskyOperation(input);
    return { content: [{ type: 'text', text: result }] };
  } catch (error) {
    return { 
      content: [{ 
        type: 'text', 
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }] 
    };
  }
});
```

## Type System

### Type Definitions

The framework exports minimal, focused types:

```typescript
export type TransportType = 'stdio' | 'http';

export type ToolHandler = (input: any) => Promise<{
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
}>;

export type MCPServerConfig = {
  name?: string;
  version?: string;  
  transport?: TransportType;
  port?: number;
};
```

### SDK Type Re-exports

```typescript
// Re-export useful SDK types for convenience
export type { 
  JSONRPCMessage,
  Tool,
  Resource,
  Prompt,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/types.js';
```

## Dependencies

### Minimal Dependency Tree

**Runtime Dependencies**:
- `@modelcontextprotocol/sdk` - Official MCP SDK
- `zod` - Schema validation and type inference
- `commander` - CLI framework
- `execa` - Process execution
- `prompts` - Interactive CLI prompts
- `find-up` - File discovery for CLI
- `typescript` - TypeScript compiler

**Removed Dependencies** (from v1.x):
- `content-type`, `raw-body` - No longer needed without custom transports
- `jsonwebtoken` - No authentication system
- Complex validation and loader systems

## Performance Characteristics

### Startup Performance

1. **No File Scanning**: Eliminates filesystem traversal overhead
2. **Direct Registration**: Components registered immediately  
3. **Minimal Validation**: Only essential schema validation
4. **SDK Optimization**: Leverages official SDK performance optimizations

### Runtime Performance

1. **Direct SDK Usage**: No wrapper overhead during operation
2. **Efficient Transport**: Official transport implementations
3. **Simple Request Routing**: Minimal indirection in request handling

### Memory Usage

1. **Single File Pattern**: Minimal module loading overhead
2. **No Component Caching**: Components defined inline, no caching needed
3. **Lean Object Model**: Simple data structures without complex inheritance

## Migration Strategy from v1.x

### Breaking Changes

The v2.0 represents a **complete architectural rewrite**:

1. **Class-based → Functional**: No more `MCPTool` inheritance
2. **Auto-discovery → Explicit**: No more file scanning
3. **Complex → Simple**: Minimal API surface
4. **Custom → Standard**: Direct SDK usage

### Migration Pattern

**v1.x Pattern**:
```typescript
class MyTool extends MCPTool {
  name = "my-tool";
  description = "Tool description";
  schema = z.object({ input: z.string().describe("Input") });
  
  async execute(input: { input: string }) {
    return `Processed: ${input.input}`;
  }
}
```

**v2.x Pattern**:
```typescript
server.addTool(
  "my-tool",
  "Tool description", 
  z.object({ input: z.string().describe("Input") }),
  async ({ input }) => ({
    content: [{ type: 'text', text: `Processed: ${input}` }]
  })
);
```

## Extensibility

### SDK Access

For advanced use cases, access the underlying SDK server:

```typescript
const server = new MCPServer(config);

// Access underlying SDK server for advanced operations
const sdkServer = server.server;
sdkServer.registerNotificationHandler(/* custom handlers */);
```

### Custom Handlers

The framework supports all SDK capabilities:

```typescript
// Standard registration
server.addTool(name, description, schema, handler);

// Advanced SDK features still available
server.server.registerNotificationHandler('custom/notification', handler);
```

## Testing Strategy

### Framework Testing

The framework itself requires minimal testing due to its thin wrapper nature:
- Configuration validation
- Registration method behavior  
- Transport creation logic
- CLI generation output

### User Project Testing

Generated projects can use standard testing approaches:
```typescript
import { MCPServer } from 'mcp-framework';

describe('My MCP Server', () => {
  it('should register tools correctly', () => {
    const server = new MCPServer({ name: 'test' });
    // Test tool registration
  });
});
```

## Future Evolution

### Alignment with SDK

The v2.0 architecture ensures **automatic compatibility** with MCP SDK updates:
- Direct SDK usage means new features are immediately available
- Minimal wrapper reduces breaking change surface area
- Standard patterns ensure long-term compatibility

### Extension Opportunities

Future enhancements can build on the solid foundation:
- Development tooling (debugging, testing)
- Advanced transport configurations
- Deployment and packaging utilities
- IDE integrations and code generation

The architecture prioritizes **stability** and **standards compliance** over feature proliferation, ensuring the framework remains a reliable foundation for MCP server development.