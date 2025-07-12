import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

export type TransportType = 'stdio' | 'http';

export interface MCPServerConfig {
  name?: string;
  version?: string;
  transport?: TransportType;
  port?: number;
}

export type ToolHandler = (input: any) => Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }>;
export type PromptHandler = (input: any) => Promise<{ messages: Array<{ role: string; content: { type: string; text: string } }> }>;
export type ResourceHandler = (uri: string) => Promise<{ contents: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }>;

/**
 * Modern MCP Server using the official SDK patterns
 */
export class MCPServer {
  private mcpServer: McpServer;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      name: config.name || this.getDefaultName(),
      version: config.version || this.getDefaultVersion(),
      transport: config.transport || 'stdio',
      port: config.port || 8080
    };

    this.mcpServer = new McpServer({
      name: this.config.name!,
      version: this.config.version!
    });
  }

  private getDefaultName(): string {
    try {
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      return packageJson.name || 'mcp-server';
    } catch {
      return 'mcp-server';
    }
  }

  private getDefaultVersion(): string {
    try {
      const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  /**
   * Add a tool with Zod schema validation
   */
  addTool(name: string, description: string, schema: z.ZodType, handler: ToolHandler): this {
    this.mcpServer.registerTool(name, {
      title: name,
      description,
      inputSchema: schema
    }, handler);
    return this;
  }

  /**
   * Add a prompt with Zod schema validation
   */
  addPrompt(name: string, description: string, schema: z.ZodType, handler: PromptHandler): this {
    this.mcpServer.registerPrompt(name, schema, handler);
    return this;
  }

  /**
   * Add a resource with URI template
   */
  addResource(name: string, template: string, description: string, handler: ResourceHandler): this {
    this.mcpServer.registerResource(name, new ResourceTemplate(template), {
      title: name,
      description
    }, handler);
    return this;
  }

  /**
   * Start the server with the configured transport
   */
  async start(): Promise<void> {
    const transport = this.createTransport();
    await this.mcpServer.connect(transport);
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.mcpServer.close();
  }

  private createTransport() {
    switch (this.config.transport) {
      case 'http':
        return new StreamableHTTPServerTransport({
          port: this.config.port!
        });
      case 'stdio':
      default:
        return new StdioServerTransport();
    }
  }

  /**
   * Get the underlying MCP server instance for advanced usage
   */
  get server(): McpServer {
    return this.mcpServer;
  }
}