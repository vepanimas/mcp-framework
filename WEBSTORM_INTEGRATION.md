# WebStorm MCP Integration

This document provides instructions for using the TypeScript-to-MCP-Server build system for WebStorm integration.

## Overview

The WebStorm MCP Integration allows you to define custom MCP (Model Context Protocol) tools in TypeScript and automatically compile them into standalone MCP servers for AI assistant integration.

## Installation

```bash
npm install mcp-framework
```

## Project Structure

A typical WebStorm MCP project has the following structure:

```
your-project/
├── .idea/
│   └── mcp/
│       ├── ts/
│       │   └── tools/
│       │       ├── GreetingTool.ts
│       │       └── ProjectInfoTool.ts
│       └── generated/
│           ├── base-classes.ts
│           ├── server.ts
│           ├── package.json
│           ├── tsconfig.json
│           └── dist/
│               └── server.js
└── mcp.config.json
```

- `.idea/mcp/ts/tools/`: Directory for TypeScript tool definitions
- `.idea/mcp/generated/`: Directory for the generated MCP server
- `mcp.config.json`: Configuration file for the MCP project

## Getting Started

### Initialize a Project

```bash
npx mcp init-project
```

This will create the necessary directory structure and configuration files.

Options:
- `--http`: Use HTTP transport instead of default stdio
- `--port <number>`: Specify HTTP port (only valid with --http)
- `--sdk`: Use official MCP SDK implementation
- `--no-example`: Skip creating example tools

### Create a Tool

```bash
npx mcp create-tool my-tool
```

This will create a new tool in the `.idea/mcp/ts/tools/` directory.

Options:
- `-t, --type <type>`: Tool type (analysis, action, utility)
- `-d, --description <description>`: Tool description

### Build the Server

```bash
npx mcp-build
```

This will build the MCP server from your TypeScript tools.

Options:
- `-c, --config <path>`: Path to config file
- `-m, --mode <mode>`: Server mode (simple or sdk)
- `-t, --transport <transport>`: Transport type (stdio or http)
- `-p, --port <port>`: HTTP port (only valid with --http)
- `--skip-validation`: Skip tool validation
- `--skip-deps`: Skip dependency installation
- `--skip-compile`: Skip compilation

### Watch for Changes

```bash
npx mcp-watch
```

This will watch for changes in your TypeScript tools and rebuild the server automatically.

Options:
- `-c, --config <path>`: Path to config file
- `-m, --mode <mode>`: Server mode (simple or sdk)
- `-t, --transport <transport>`: Transport type (stdio or http)
- `-p, --port <port>`: HTTP port (only valid with --http)
- `-d, --debounce <ms>`: Debounce time in milliseconds

### Validate Tools

```bash
npx mcp-validate
```

This will validate your TypeScript tools without building the server.

Options:
- `-c, --config <path>`: Path to config file
- `--fix`: Attempt to fix common issues

## Defining Tools

Tools are defined as TypeScript classes that extend the `MCPTool` base class.

```typescript
import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';

/**
 * A simple greeting tool
 */
export class GreetingTool extends MCPTool {
  readonly name = 'greeting';
  readonly description = 'Greets a user by name';
  
  readonly schema = z.object({
    name: z.string().describe('User name to greet'),
    formal: z.boolean().optional().describe('Whether to use formal greeting')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      const { name, formal } = input;
      
      const greeting = formal ? 'Hello' : 'Hi';
      return this.textResponse(`${greeting}, ${name}! Welcome to MCP tools.`);
    } catch (error) {
      return this.errorResponse(`Failed to generate greeting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
```

### Tool Requirements

- Tools must extend the `MCPTool` base class
- Tools must define `name`, `description`, and `schema` properties
- Tools must implement the `execute` method
- Schema fields must have descriptions using `.describe()`
- Tool names must be kebab-case (lowercase with hyphens)

### Response Types

Tools can return different types of responses:

- `this.textResponse(text)`: Returns a text response
- `this.jsonResponse(data)`: Returns a JSON response
- `this.errorResponse(error)`: Returns an error response

### Context

The `execute` method receives a context object with information about the project:

```typescript
interface ToolContext {
  /** Project root directory */
  projectRoot: string;
  /** Current workspace files */
  workspaceFiles?: string[];
  /** Git information if available */
  git?: {
    branch?: string;
    remoteUrl?: string;
  };
}
```

## WebStorm Integration

To integrate your MCP server with WebStorm:

1. Build the server using `npx mcp-build`
2. Add the following to your `claude_desktop_config.json`:

```json
{
  "your-project-name": {
    "command": "node",
    "args": ["/path/to/.idea/mcp/generated/dist/server.js"]
  }
}
```

3. Restart WebStorm
4. Use your tools in the WebStorm AI assistant

## Configuration

The `mcp.config.json` file contains the configuration for your MCP project:

```json
{
  "name": "webstorm-mcp-server",
  "version": "1.0.0",
  "projectRoot": "/path/to/your/project",
  "toolsDir": ".idea/mcp/ts/tools",
  "outputDir": ".idea/mcp/generated",
  "mode": "simple",
  "serverName": "webstorm-mcp-server",
  "serverVersion": "1.0.0",
  "transport": "stdio",
  "port": 3000
}
```

## SDK Migration

The MCP server can be implemented using either a simple JSON-RPC implementation or the official MCP SDK.

To migrate from the simple implementation to the official SDK:

```bash
npx mcp migrate-to-sdk
```

Options:
- `-c, --config <path>`: Path to config file
- `--backup`: Create backup before migration

To check SDK compatibility:

```bash
npx mcp check-sdk-compatibility
```

## Programmatic Usage

You can also use the WebStorm MCP Integration programmatically:

```typescript
import { 
  initProject, 
  build, 
  watchAndBuild, 
  validate, 
  migrateToSDK 
} from 'mcp-framework/codegen';

// Initialize a project
await initProject({
  name: 'my-project',
  transport: 'http',
  port: 3000
});

// Build the server
const result = await build({
  mode: 'simple',
  transport: 'stdio'
});

// Watch for changes
await watchAndBuild({
  debounceTime: 500
});

// Validate tools
const validationResults = await validate();

// Migrate to SDK
await migrateToSDK({}, true);
```

## Troubleshooting

### Tool Discovery Issues

If tools are not being discovered:

- Ensure tools are in the correct directory (`.idea/mcp/ts/tools/` by default)
- Ensure tools extend the `MCPTool` base class
- Ensure tools export a class (not an instance)

### Validation Issues

If tools fail validation:

- Ensure tool names are kebab-case
- Ensure all schema fields have descriptions
- Ensure tools implement all required properties and methods

### Build Issues

If the build fails:

- Check the error messages for specific issues
- Ensure all dependencies are installed
- Try running with `--skip-deps` or `--skip-compile` to isolate the issue

### WebStorm Integration Issues

If the WebStorm integration doesn't work:

- Ensure the server is built successfully
- Ensure the path in `claude_desktop_config.json` is correct
- Restart WebStorm after making changes

## Advanced Usage

### Custom Tool Directory

You can specify a custom tools directory in the configuration:

```json
{
  "toolsDir": "custom/tools/directory"
}
```

### HTTP Transport

You can use HTTP transport instead of stdio:

```json
{
  "transport": "http",
  "port": 3000
}
```

### Custom Server Name

You can specify a custom server name:

```json
{
  "serverName": "my-custom-server"
}
```

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
