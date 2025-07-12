import { z } from 'zod';
import { ServerMode } from './ServerGenerator.js';

/**
 * MCP configuration schema using Zod for validation
 */
export const mcpConfigSchema = z.object({
  /**
   * Project name
   */
  name: z.string().min(1).describe('Project name'),
  
  /**
   * Project version
   */
  version: z.string().min(1).describe('Project version'),
  
  /**
   * Project root directory (absolute path)
   */
  projectRoot: z.string().min(1).describe('Project root directory'),
  
  /**
   * Tools directory (relative to project root)
   */
  toolsDir: z.string().min(1).default('.idea/mcp/ts/tools').describe('Tools directory'),
  
  /**
   * Output directory (relative to project root)
   */
  outputDir: z.string().min(1).default('.idea/mcp/generated').describe('Output directory'),
  
  /**
   * Server generation mode
   */
  mode: z.nativeEnum(ServerMode).default(ServerMode.SIMPLE).describe('Server generation mode'),
  
  /**
   * Server name
   */
  serverName: z.string().min(1).default('webstorm-mcp-server').describe('Server name'),
  
  /**
   * Server version
   */
  serverVersion: z.string().min(1).default('1.0.0').describe('Server version'),
  
  /**
   * Transport type
   */
  transport: z.enum(['stdio', 'http']).default('stdio').describe('Transport type'),
  
  /**
   * HTTP port (only used with HTTP transport)
   */
  port: z.number().int().positive().optional().describe('HTTP port'),
  
  /**
   * Whether to skip validation
   */
  skipValidation: z.boolean().default(false).describe('Skip validation'),
  
  /**
   * Whether to skip dependency installation
   */
  skipDependencyInstall: z.boolean().default(false).describe('Skip dependency installation'),
  
  /**
   * Whether to skip compilation
   */
  skipCompilation: z.boolean().default(false).describe('Skip compilation'),
  
  /**
   * Whether to copy tool files to the output directory
   */
  copyToolFiles: z.boolean().default(true).describe('Copy tool files to output directory'),
  
  /**
   * Additional configuration options
   */
  options: z.record(z.unknown()).optional().describe('Additional configuration options')
});

/**
 * MCP configuration type
 */
export type MCPConfig = z.infer<typeof mcpConfigSchema>;

/**
 * Default MCP configuration
 */
export const DEFAULT_CONFIG: Partial<MCPConfig> = {
  name: 'webstorm-mcp-server',
  version: '1.0.0',
  toolsDir: '.idea/mcp/ts/tools',
  outputDir: '.idea/mcp/generated',
  mode: ServerMode.SIMPLE,
  serverName: 'webstorm-mcp-server',
  serverVersion: '1.0.0',
  transport: 'stdio',
  skipValidation: false,
  skipDependencyInstall: false,
  skipCompilation: false,
  copyToolFiles: true
};

/**
 * Generated project structure
 * 
 * This defines the structure of the generated project files
 */
export const PROJECT_STRUCTURE = {
  /**
   * Tools directory structure
   */
  tools: {
    /**
     * Directory for TypeScript tool definitions
     */
    directory: '.idea/mcp/ts/tools',
    /**
     * Example tools to create
     */
    examples: [
      'GreetingTool.ts',
      'ProjectInfoTool.ts'
    ]
  },
  
  /**
   * Generated server structure
   */
  generated: {
    /**
     * Directory for generated server
     */
    directory: '.idea/mcp/generated',
    /**
     * Files to generate
     */
    files: [
      'base-classes.ts',
      'server.ts',
      'package.json',
      'tsconfig.json'
    ],
    /**
     * Compiled output directory
     */
    output: 'dist'
  },
  
  /**
   * Configuration file
   */
  config: {
    /**
     * Configuration file name
     */
    filename: 'mcp.config.json'
  },
  
  /**
   * WebStorm integration
   */
  webstorm: {
    /**
     * Claude Desktop configuration file
     */
    claudeConfig: 'claude_desktop_config.json',
    /**
     * Server executable path (relative to generated directory)
     */
    serverPath: 'dist/server.js'
  }
};

/**
 * Validates an MCP configuration
 * 
 * @param config Configuration to validate
 * @returns Validated configuration
 * @throws Error if validation fails
 */
export function validateConfig(config: unknown): MCPConfig {
  return mcpConfigSchema.parse(config);
}

/**
 * Creates a default configuration with overrides
 * 
 * @param overrides Configuration overrides
 * @returns Default configuration with overrides
 */
export function createDefaultConfig(overrides: Partial<MCPConfig> = {}): MCPConfig {
  return {
    ...DEFAULT_CONFIG,
    projectRoot: process.cwd(),
    ...overrides
  } as MCPConfig;
}

/**
 * Generates WebStorm integration instructions
 * 
 * @param config MCP configuration
 * @returns WebStorm integration instructions
 */
export function generateWebStormInstructions(config: MCPConfig): string {
  const serverPath = `${config.outputDir}/${PROJECT_STRUCTURE.webstorm.serverPath}`;
  
  return `
WebStorm Integration Instructions:
---------------------------------
Add the following to your ${PROJECT_STRUCTURE.webstorm.claudeConfig}:

{
  "${config.serverName}": {
    "command": "node",
    "args": ["${serverPath}"]
  }
}

Or run the server directly with:

node ${serverPath}
`;
}

/**
 * Generates a README file for the generated project
 * 
 * @param config MCP configuration
 * @returns README content
 */
export function generateReadme(config: MCPConfig): string {
  return `# ${config.name}

MCP Server for WebStorm integration

## Project Structure

- \`${config.toolsDir}\`: TypeScript tool definitions
- \`${config.outputDir}\`: Generated MCP server
  - \`${PROJECT_STRUCTURE.webstorm.serverPath}\`: Compiled server executable

## Usage

### Building the server

\`\`\`
mcp build
\`\`\`

### Watching for changes

\`\`\`
mcp watch
\`\`\`

### Creating a new tool

\`\`\`
mcp create-tool my-tool
\`\`\`

### Validating tools

\`\`\`
mcp validate
\`\`\`

## WebStorm Integration

${generateWebStormInstructions(config).trim()}

## Configuration

The project configuration is stored in \`${PROJECT_STRUCTURE.config.filename}\`.

## Server Mode

The server is currently using the ${config.mode === ServerMode.SIMPLE ? 'simple JSON-RPC' : 'official MCP SDK'} implementation.

${config.mode === ServerMode.SIMPLE ? 'To migrate to the official MCP SDK implementation, run:\n\n```\nmcp migrate-to-sdk\n```' : ''}
`;
}
