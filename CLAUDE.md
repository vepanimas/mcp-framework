# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a **modern, standards-compliant** TypeScript framework for building Model Context Protocol (MCP) servers. It provides a minimal, elegant wrapper around the official MCP SDK with a focus on simplicity and direct registration patterns.

## Quick Start

```typescript
import { MCPServer, z } from 'mcp-framework';

const server = new MCPServer({
  name: 'my-server',
  version: '1.0.0'
});

server
  .addTool(
    'calculate',
    'Perform basic math calculations',
    z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']).describe('Math operation'),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number')
    }),
    async ({ operation, a, b }) => {
      let result: number;
      switch (operation) {
        case 'add': result = a + b; break;
        case 'subtract': result = a - b; break;
        case 'multiply': result = a * b; break;
        case 'divide': result = a / b; break;
      }
      return { content: [{ type: 'text', text: `${a} ${operation} ${b} = ${result}` }] };
    }
  )
  .start();
```

## Common Development Commands

### Building and Development
- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch mode compilation for development
- `mcp build` - Build MCP projects (when used as a CLI)

### Code Quality
- `npm run lint` - Run ESLint on the codebase
- `npm run lint:fix` - Run ESLint with automatic fixes
- `npm run format` - Format code using Prettier

### Project Management
- `mcp create <project-name>` - Create new MCP server project
- `mcp create <project-name> --http --port 8080` - Create HTTP-based server

## Core Architecture

### MCPServer Class
The main server class provides a fluent interface for registering components:

```typescript
const server = new MCPServer({
  name: 'my-server',      // Server name (defaults to package.json name)
  version: '1.0.0',       // Server version (defaults to package.json version)  
  transport: 'stdio',     // Transport type: 'stdio' | 'http'
  port: 8080             // Port for HTTP transport
});
```

### Direct Registration Pattern

**Tools**:
```typescript
server.addTool(name, description, schema, handler)
```

**Prompts**:
```typescript
server.addPrompt(name, description, schema, handler)
```

**Resources**:
```typescript
server.addResource(name, template, description, handler)
```

### Standards Compliance

This framework uses the **official MCP SDK** (`@modelcontextprotocol/sdk`) directly:
- `McpServer` class for server management
- `registerTool()`, `registerPrompt()`, `registerResource()` methods
- Direct transport usage (`StdioServerTransport`, `StreamableHTTPServerTransport`)
- Standard JSON-RPC message handling

## Development Patterns

### Tool Definition
```typescript
server.addTool(
  'tool-name',
  'Clear description of what the tool does',
  z.object({
    param1: z.string().describe('Parameter description'),
    param2: z.number().optional().describe('Optional parameter'),
    param3: z.enum(['option1', 'option2']).describe('Choice parameter')
  }),
  async (input) => {
    // Tool logic here
    return {
      content: [
        { type: 'text', text: 'Text response' },
        { type: 'image', data: 'base64data', mimeType: 'image/png' }
      ]
    };
  }
);
```

### Schema Validation
- All schemas use **Zod** for validation and type inference
- Input parameters are automatically validated
- TypeScript types are inferred from Zod schemas
- All schema fields should have `.describe()` for documentation

### Transport Configuration
```typescript
// Stdio transport (default - for Claude Desktop)
const server = new MCPServer({ transport: 'stdio' });

// HTTP transport (for web applications)
const server = new MCPServer({ 
  transport: 'http', 
  port: 8080 
});
```

### Error Handling
```typescript
server.addTool('risky-tool', 'Description', schema, async (input) => {
  try {
    // Tool logic
    return { content: [{ type: 'text', text: 'Success' }] };
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

## Project Structure

Modern MCP projects have a minimal structure:

```
my-project/
├── src/
│   └── index.ts          # Single file with all registrations
├── package.json          # Minimal dependencies
├── tsconfig.json         # Standard TypeScript config
└── README.md            # Project documentation
```

### Single File Pattern
Unlike the old class-based approach, modern projects use a **single file pattern**:

```typescript
// src/index.ts
import { MCPServer, z } from 'mcp-framework';

const server = new MCPServer({ name: 'my-server' });

// All tools, prompts, and resources registered inline
server
  .addTool(/* ... */)
  .addTool(/* ... */)
  .addPrompt(/* ... */)
  .addResource(/* ... */)
  .start();
```

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
- Run lint
- Commit with conventional commit format
- Push feature branch
- Do not merge to main
```

## Environment Variables

- None required - the framework is designed to work out of the box
- Configuration is handled through constructor options

## Key Differences from v1.x

This v2.0 represents a **complete rewrite** for standards compliance:

### ❌ **Removed (Breaking Changes)**:
- Class-based tool system (`MCPTool`, `BasePrompt`, `BaseResource`)
- Auto-discovery and file scanning
- Custom transport abstraction layer
- Complex validation system
- Component generation commands (`mcp add tool`, etc.)

### ✅ **New (Modern Approach)**:
- Direct registration pattern using official SDK APIs
- Single-file project structure
- Fluent interface for component registration
- Minimal dependencies and complexity
- 100% standards compliance with official MCP SDK

### Migration from v1.x
v1.x projects need complete rewrite - there is no automatic migration path. The new pattern is much simpler:

```typescript
// Old v1.x (class-based)
class MyTool extends MCPTool {
  name = "my-tool";
  schema = z.object({...});
  async execute(input) { ... }
}

// New v2.x (direct registration)
server.addTool("my-tool", "Description", z.object({...}), async (input) => {
  // Same logic
});
```

## Perfect for IDE Integration

This framework is **optimized for programmatic use** from IDEs:
- Simple, predictable API surface
- Minimal configuration required
- Single file pattern for easy code generation
- No hidden magic or auto-discovery
- Direct control over all registrations