# MCP Framework Architecture

This document provides detailed insights into the implementation and architecture of the MCP Framework.

## Overview

The MCP Framework is a sophisticated TypeScript framework for building Model Context Protocol (MCP) servers. It provides auto-discovery, type-safe tool development, multiple transport layers, and comprehensive validation - all while maintaining a simple developer experience.

## Core Architecture Components

### 1. Auto-Discovery System

The framework's auto-discovery system is built on three key components:

#### File Discovery Engine (`src/utils/fileDiscovery.ts`)

**Purpose**: Intelligently traverses the filesystem to find MCP components.

**Key Features**:
- **Recursive traversal** with pattern matching support
- **Glob-style exclusion patterns** (`*.test.js`, `BaseTool.js`, etc.)
- **Smart path resolution**: Checks `dist/` directory first, falls back to module path
- **Extension filtering** with configurable file types
- **Performance optimized** with early returns and efficient directory scanning

**Implementation Insight**: The discovery engine doesn't just scan files - it understands development vs production environments and intelligently resolves module paths for both scenarios.

```typescript
// Example: Smart directory resolution
const distPath = join(projectRoot, 'dist', subdirectory);
if (existsSync(distPath)) {
  return distPath; // Production: use compiled output
}
// Development: use source files
```

#### BaseLoader Pattern (`src/loaders/BaseLoader.ts`)

**Purpose**: Abstract factory pattern for loading and validating components.

**Architecture**:
- **Template Method Pattern**: Common loading logic with specialized validation
- **ES Module Support**: Dynamic imports using `pathToFileURL()`
- **Type Safety**: Validates instances using type guards before registration
- **Error Handling**: Graceful failure with detailed logging

**Key Loaders**:
- `ToolLoader`: Validates tools have required methods and properties
- `PromptLoader`: Validates prompt definitions and message generation
- `ResourceLoader`: Validates resource URIs and read capabilities

**Implementation Insight**: Each loader handles the complexity of ES module dynamic imports while providing type-safe component instantiation.

### 2. Zod Integration and Schema System

#### Schema to JSON Schema Conversion (`src/tools/BaseTool.ts`)

**Purpose**: Bridge between Zod runtime validation and MCP's JSON Schema requirements.

**Key Implementation**:

```typescript
private generateSchemaFromZodObject(zodSchema: z.ZodObject<any>): {
  type: 'object';
  properties: Record<string, unknown>;
  required: string[];
} {
  const shape = zodSchema.shape;
  const missingDescriptions: string[] = [];

  Object.entries(shape).forEach(([key, fieldSchema]) => {
    const fieldInfo = this.extractFieldInfo(fieldSchema as z.ZodType);
    
    if (!fieldInfo.jsonSchema.description) {
      missingDescriptions.push(key);
    }
    // ... property generation
  });

  if (missingDescriptions.length > 0) {
    throw new Error(`Missing descriptions for fields...`);
  }
}
```

**Advanced Features**:
- **Modifier Unwrapping**: Recursively handles Optional, Default, Nullable
- **Constraint Extraction**: Converts Zod constraints to JSON Schema (min/max, patterns, enums)
- **Nested Object Support**: Handles complex nested schemas
- **Type Inference**: Automatic TypeScript type generation

#### Type Magic and Inference

**Automatic Type Inference**:
```typescript
export type MCPInput<T extends MCPTool<any, any>> = InferSchemaType<T['schema']>;
```

**Implementation Insight**: This creates a magical developer experience where TypeScript automatically infers input types from Zod schemas, eliminating duplicate type definitions entirely.

#### Multi-Level Validation System

**Four-Stage Validation Pipeline**:

1. **Development-time**: `defineSchema()` helper provides immediate feedback
2. **Build-time**: `npm run build` validates all tool schemas
3. **Startup-time**: Server validates during component loading  
4. **Runtime**: Zod validates actual tool inputs

**Enforcement Strategy**:
- **Fail Fast**: Development errors caught immediately
- **Build Prevention**: Invalid tools can't be deployed
- **Runtime Safety**: Input validation with detailed error messages
- **Progressive Enhancement**: Better errors in development, graceful handling in production

### 3. MCP Protocol Handling

#### Event-Driven Request Handling (`src/core/MCPServer.ts`)

**Purpose**: Maps MCP protocol requests to component handlers with dynamic capability detection.

**Key Implementation**:

```typescript
private setupHandlers(server?: Server) {
  // Tools handling
  targetServer.setRequestHandler(ListToolsRequestSchema, async (request: any) => {
    const tools = Array.from(this.toolsMap.values()).map((tool) => tool.toolDefinition);
    return { tools, nextCursor: undefined };
  });

  targetServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const tool = this.toolsMap.get(request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }
    return await tool.toolCall(toolRequest);
  });
}
```

**Dynamic Capability Detection**:
```typescript
private async detectCapabilities(): Promise<ServerCapabilities> {
  if (await this.toolLoader.hasTools()) {
    this.capabilities.tools = {};
  }
  if (await this.promptLoader.hasPrompts()) {
    this.capabilities.prompts = {};
  }
  // ... etc
}
```

**Implementation Insight**: The server adapts its MCP capabilities based on discovered components, making it truly modular. Only available capabilities are advertised to clients.

#### Component Storage and Lookup

**Efficient Data Structures**:
- **Maps for O(1) lookup**: `Map<string, ToolProtocol>`
- **Keyed by component identifier**: Tool name, prompt name, resource URI
- **Type-safe storage**: Generic Maps with proper typing

### 4. Multi-Transport Architecture

#### Transport Abstraction (`src/transports/base.ts`)

**Purpose**: Unified interface for different communication protocols.

**Common Interface**:
```typescript
abstract class AbstractTransport {
  abstract readonly type: string;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  onMessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
}
```

#### SSE Transport Implementation (`src/transports/sse/server.ts`)

**Features**:
- **Connection Management**: Map of active SSE connections with unique session IDs
- **Ping/Keepalive**: Built-in connection health monitoring
- **Authentication Middleware**: Pluggable auth providers (JWT, API Key, Custom)
- **CORS Support**: Configurable cross-origin resource sharing

**Connection Lifecycle**:
```typescript
private _connections: Map<string, { 
  res: ServerResponse, 
  intervalId: NodeJS.Timeout 
}>
```

#### HTTP Stream Transport (`src/transports/http/server.ts`)

**Features**:
- **SDK Integration**: Uses official MCP SDK's `StreamableHTTPServerTransport`
- **Session Management**: Per-session transport instances
- **Response Modes**: Batch (JSON-RPC) vs Stream (SSE) responses
- **Request Correlation**: Proper request/response matching

**Implementation Insight**: Each transport handles the complexity of its specific protocol while presenting a unified interface to the MCP server core.

### 5. CLI and Code Generation System

#### Template-Based Generation (`src/cli/project/`)

**Architecture**:
- **Interactive Prompts**: User-friendly project and component creation
- **Template System**: Generates working code, not just boilerplate
- **Validation**: Ensures project structure and naming conventions
- **Smart Defaults**: Sensible defaults with customization options

**Tool Generation Example** (`src/cli/project/add-tool.ts`):
```typescript
const toolContent = `import { MCPTool } from "mcp-framework";
import { z } from "zod";

class ${className}Tool extends MCPTool<${className}Input> {
  name = "${toolName}";
  description = "${className} tool description";
  
  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ${className}Input) {
    return \`Processed: \${input.message}\`;
  }
}`;
```

**Implementation Insight**: The CLI generates immediately working code with proper imports, TypeScript types, and MCP compliance - not just empty templates.

## Performance and Optimization Strategies

### 1. Memory Management

**Efficient Component Storage**:
- Maps for O(1) component lookup during request handling
- Lazy loading of components only when directory scanning occurs
- Minimal memory footprint per client connection
- Smart caching of capability detection results

### 2. Filesystem Optimization

**Smart Path Resolution**:
- Priority-based path checking (dist/ first, then source)
- Caching of resolved module paths to avoid repeated filesystem calls
- Early returns in directory traversal for performance
- Efficient exclusion pattern matching

### 3. Network Optimization

**Transport Efficiency**:
- Connection pooling for SSE transport
- Configurable batch timeouts for HTTP streaming
- Intelligent ping/keepalive intervals
- Minimal protocol overhead

## Error Handling Strategy

### 1. Layered Error Handling

**Component Level**:
- Validation errors with specific field information
- Descriptive error messages with fix suggestions
- Graceful degradation when components fail to load

**Transport Level**:
- Connection error recovery
- Protocol-specific error formatting
- Client-friendly error responses

**Server Level**:
- Centralized error logging with context
- Graceful shutdown on critical errors
- Signal handling for clean termination

### 2. Development vs Production

**Development Mode**:
- Verbose error messages with stack traces
- Immediate validation feedback
- Enhanced debugging information

**Production Mode**:
- Sanitized error messages for clients
- Comprehensive logging for operators
- Graceful error recovery

## Security Considerations

### 1. Input Validation

**Multi-Layer Validation**:
- Schema validation at component definition time
- Runtime input validation using Zod
- Type safety through TypeScript compilation
- Sanitization of error messages to prevent information leakage

### 2. Authentication Integration

**Pluggable Auth System**:
- Support for JWT and API Key authentication
- Custom authentication provider interface
- Per-endpoint authentication configuration
- Secure credential handling

### 3. Transport Security

**Protocol Security**:
- CORS configuration for web clients
- Request size limiting to prevent DoS
- Session management for HTTP transports
- Connection validation and cleanup

## Extension Points

### 1. Custom Transports

Implement `AbstractTransport` to add new communication protocols:
```typescript
class CustomTransport extends AbstractTransport {
  readonly type = "custom";
  // Implement required methods
}
```

### 2. Custom Authentication

Implement `AuthProvider` interface for custom authentication:
```typescript
class CustomAuthProvider implements AuthProvider {
  async authenticate(req: IncomingMessage): Promise<boolean | AuthResult> {
    // Custom authentication logic
  }
}
```

### 3. Custom Loaders

Extend `BaseLoader` for custom component types:
```typescript
class CustomLoader extends BaseLoader<CustomComponent> {
  // Implement validation and instantiation
}
```

## Conclusion

The MCP Framework demonstrates sophisticated software engineering with careful attention to:

- **Developer Experience**: Type safety, auto-discovery, and intelligent code generation
- **Production Readiness**: Performance optimization, error handling, and security
- **Extensibility**: Clean abstractions and well-defined extension points
- **Maintainability**: Clear separation of concerns and comprehensive validation

The architecture successfully bridges the gap between the complexity of building robust MCP servers and the simplicity developers expect when using the framework.