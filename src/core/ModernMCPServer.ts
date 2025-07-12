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
 * Simplified MCP Server wrapper
 * This is a minimal implementation that will be used by the generated servers
 */
export class MCPServer {
  private config: MCPServerConfig;
  private tools: Map<string, { description: string; schema: z.ZodType; handler: ToolHandler }> = new Map();

  constructor(config: MCPServerConfig = {}) {
    this.config = {
      name: config.name || 'mcp-server',
      version: config.version || '1.0.0',
      transport: config.transport || 'stdio',
      port: config.port || 8080
    };
  }

  /**
   * Add a tool with Zod schema validation
   */
  addTool(name: string, description: string, schema: z.ZodType, handler: ToolHandler): this {
    this.tools.set(name, { description, schema, handler });
    return this;
  }

  /**
   * Start the server - placeholder implementation
   * The actual server implementation will be in the generated code
   */
  async start(): Promise<void> {
    console.log(`Starting ${this.config.name} v${this.config.version}`);
    console.log(`Transport: ${this.config.transport}`);
    console.log(`Tools registered: ${Array.from(this.tools.keys()).join(', ')}`);
    
    // This will be replaced with actual MCP SDK implementation in generated code
    if (this.config.transport === 'stdio') {
      // Handle stdio transport
      process.stdin.on('data', (data) => {
        // Process MCP messages
        this.handleMessage(data.toString());
      });
    }
  }

  private async handleMessage(message: string) {
    try {
      const parsed = JSON.parse(message);
      // Basic message handling - will be enhanced in generated code
      console.log('Received message:', parsed);
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  // Getters for generated code
  get toolsMap() {
    return this.tools;
  }

  get serverConfig() {
    return this.config;
  }
}