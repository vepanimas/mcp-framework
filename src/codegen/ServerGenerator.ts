import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { ToolInfo } from './ToolDiscovery.js';

/**
 * Server generation mode
 */
export enum ServerMode {
  /** Simple JSON-RPC implementation */
  SIMPLE = 'simple',
  /** Official MCP SDK implementation */
  SDK = 'sdk'
}

/**
 * Options for server generation
 */
export interface ServerGeneratorOptions {
  /** Project root directory */
  projectRoot: string;
  /** Output directory for the generated server */
  outputDir: string;
  /** Server generation mode */
  mode: ServerMode;
  /** Server name */
  serverName: string;
  /** Server version */
  serverVersion: string;
  /** Transport type */
  transport: 'stdio' | 'http';
  /** HTTP port (only used with HTTP transport) */
  port?: number;
}

/**
 * Result of server generation
 */
export interface GenerationResult {
  /** Output directory */
  outputDir: string;
  /** Generated files */
  generatedFiles: string[];
  /** Any errors encountered during generation */
  errors: string[];
}

/**
 * Generates a standalone MCP server from TypeScript tool definitions
 */
export class ServerGenerator {
  private options: ServerGeneratorOptions;
  private errors: string[] = [];
  private generatedFiles: string[] = [];
  
  /**
   * Creates a new ServerGenerator instance
   * 
   * @param options Server generator options
   */
  constructor(options: ServerGeneratorOptions) {
    this.options = {
      ...options,
      outputDir: path.resolve(options.projectRoot, options.outputDir)
    };
  }
  
  /**
   * Generates a server from the provided tools
   * 
   * @param tools Array of tool information
   * @returns Promise resolving to the generation result
   */
  async generateServer(tools: ToolInfo[]): Promise<GenerationResult> {
    this.errors = [];
    this.generatedFiles = [];
    
    try {
      // Create output directory if it doesn't exist
      if (!existsSync(this.options.outputDir)) {
        mkdirSync(this.options.outputDir, { recursive: true });
      }
      
      // Generate base classes
      await this.generateBaseClasses();
      
      // Generate server file
      await this.generateServerFile(tools);
      
      // Generate package.json
      await this.generatePackageJson();
      
      // Generate tsconfig.json
      await this.generateTsConfig();
      
      return {
        outputDir: this.options.outputDir,
        generatedFiles: this.generatedFiles,
        errors: this.errors
      };
    } catch (error) {
      this.errors.push(`Error generating server: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        outputDir: this.options.outputDir,
        generatedFiles: this.generatedFiles,
        errors: this.errors
      };
    }
  }
  
  /**
   * Generates the base classes file
   */
  private async generateBaseClasses(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'base-classes.ts');
    
    const content = `import { z } from 'zod';

/**
 * Context information provided to tools during execution
 */
export interface ToolContext {
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

/**
 * Text response from a tool
 */
export interface TextResponse {
  type: 'text';
  text: string;
}

/**
 * JSON response from a tool
 */
export interface JsonResponse {
  type: 'json';
  data: unknown;
}

/**
 * Error response from a tool
 */
export interface ErrorResponse {
  type: 'error';
  error: string;
}

/**
 * Combined type for all possible tool responses
 */
export type ToolResult = TextResponse | JsonResponse | ErrorResponse;

/**
 * Abstract base class for MCP tools in WebStorm
 */
export abstract class MCPTool {
  /** Unique name for the tool (kebab-case recommended) */
  abstract readonly name: string;
  
  /** Human-readable description of what the tool does */
  abstract readonly description: string;
  
  /** Zod schema defining the input parameters for the tool */
  abstract readonly schema: z.ZodType;
  
  /**
   * Execute the tool with the provided input and context
   * 
   * @param input Validated input matching the schema
   * @param context Optional execution context
   * @returns Promise resolving to a tool result
   */
  abstract execute(input: any, context?: ToolContext): Promise<ToolResult>;
  
  /**
   * Create a text response
   * 
   * @param text The text content to return
   * @returns A properly formatted text response
   */
  protected textResponse(text: string): TextResponse {
    return { type: 'text', text };
  }
  
  /**
   * Create a JSON response
   * 
   * @param data The data to return as JSON
   * @returns A properly formatted JSON response
   */
  protected jsonResponse(data: unknown): JsonResponse {
    return { type: 'json', data };
  }
  
  /**
   * Create an error response
   * 
   * @param error The error message
   * @returns A properly formatted error response
   */
  protected errorResponse(error: string): ErrorResponse {
    return { type: 'error', error };
  }
}

/**
 * Type helper to infer the input type from a tool's schema
 */
export type ToolInput<T extends MCPTool> = z.infer<T['schema']>;
`;
    
    await fs.writeFile(filePath, content, 'utf8');
    this.generatedFiles.push(filePath);
  }
  
  /**
   * Generates the server file
   * 
   * @param tools Array of tool information
   */
  private async generateServerFile(tools: ToolInfo[]): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'server.ts');
    
    // Generate imports for tools
    const toolImports = tools.map(tool => {
      const relativePath = tool.filePath.replace(/\.ts$/, '');
      return `import { ${tool.className} } from './${relativePath}';`;
    }).join('\n');
    
    // Generate tool instances
    const toolInstances = tools.map(tool => `new ${tool.className}()`).join(',\n  ');
    
    // Generate server content based on mode
    let serverContent: string;
    
    if (this.options.mode === ServerMode.SIMPLE) {
      serverContent = this.generateSimpleServer(toolImports, toolInstances);
    } else {
      serverContent = this.generateSDKServer(toolImports, toolInstances);
    }
    
    await fs.writeFile(filePath, serverContent, 'utf8');
    this.generatedFiles.push(filePath);
  }
  
  /**
   * Generates a simple JSON-RPC server
   * 
   * @param toolImports Tool import statements
   * @param toolInstances Tool instance creation
   * @returns Server content
   */
  private generateSimpleServer(toolImports: string, toolInstances: string): string {
    return `#!/usr/bin/env node
import { createInterface } from 'readline';
import { MCPTool, ToolContext, ToolResult } from './base-classes';
${toolImports}

/**
 * JSON-RPC request
 */
type JsonRpcRequest = {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
};

/**
 * JSON-RPC response
 */
type JsonRpcResponse = {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
};

/**
 * MCP Server for WebStorm integration
 */
class MCPServer {
  private tools: MCPTool[] = [];
  private toolMap = new Map<string, MCPTool>();
  private context: ToolContext;
  
  constructor() {
    this.context = {
      projectRoot: process.cwd(),
      git: this.getGitInfo()
    };
    
    // Register tools
    this.tools = [
  ${toolInstances}
    ];
    
    // Create tool map for quick lookup
    for (const tool of this.tools) {
      this.toolMap.set(tool.name, tool);
    }
  }
  
  /**
   * Gets git information if available
   */
  private getGitInfo(): { branch?: string; remoteUrl?: string } {
    // This would be implemented to get git info from the environment
    // For now, return empty object
    return {};
  }
  
  /**
   * Starts the server
   */
  start(): void {
    if (${this.options.transport === 'http'}) {
      this.startHttpServer();
    } else {
      this.startStdioServer();
    }
  }
  
  /**
   * Starts an HTTP server
   */
  private startHttpServer(): void {
    const http = require('http');
    const port = ${this.options.port || 3000};
    
    const server = http.createServer(async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
      }
      
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          const request = JSON.parse(body) as JsonRpcRequest;
          const response = await this.handleRequest(request);
          
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(response));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: 'Parse error',
              data: error instanceof Error ? error.message : String(error)
            }
          }));
        }
      });
    });
    
    server.listen(port, () => {
      console.log(\`MCP Server listening on port \${port}\`);
    });
  }
  
  /**
   * Starts a stdio server
   */
  private startStdioServer(): void {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });
    
    rl.on('line', async (line) => {
      try {
        const request = JSON.parse(line) as JsonRpcRequest;
        const response = await this.handleRequest(request);
        
        console.log(JSON.stringify(response));
      } catch (error) {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: error instanceof Error ? error.message : String(error)
          }
        }));
      }
    });
    
    // Send server info to stdout
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: 'server-info',
      result: {
        name: '${this.options.serverName}',
        version: '${this.options.serverVersion}',
        capabilities: {
          tools: this.tools.map(tool => ({
            name: tool.name,
            description: tool.description
          }))
        }
      }
    }));
  }
  
  /**
   * Handles a JSON-RPC request
   * 
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    // Validate JSON-RPC request
    if (request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32600,
          message: 'Invalid Request',
          data: 'jsonrpc must be "2.0"'
        }
      };
    }
    
    // Handle methods
    switch (request.method) {
      case 'listTools':
        return this.handleListTools(request);
      
      case 'callTool':
        return this.handleCallTool(request);
      
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: \`Method "\${request.method}" not found\`
          }
        };
    }
  }
  
  /**
   * Handles the listTools method
   * 
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private handleListTools(request: JsonRpcRequest): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          schema: this.zodToJsonSchema(tool.schema)
        }))
      }
    };
  }
  
  /**
   * Handles the callTool method
   * 
   * @param request JSON-RPC request
   * @returns JSON-RPC response
   */
  private async handleCallTool(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params || {};
    const toolName = params.name;
    const toolArgs = params.arguments || {};
    
    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: 'Tool name is required'
        }
      };
    }
    
    const tool = this.toolMap.get(toolName);
    
    if (!tool) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32602,
          message: 'Invalid params',
          data: \`Tool "\${toolName}" not found\`
        }
      };
    }
    
    try {
      // Validate input against schema
      const validatedInput = tool.schema.parse(toolArgs);
      
      // Execute tool
      const result = await tool.execute(validatedInput, this.context);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        result
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  
  /**
   * Converts a Zod schema to JSON Schema
   * 
   * @param schema Zod schema
   * @returns JSON Schema
   */
  private zodToJsonSchema(schema: any): any {
    // This is a simplified implementation
    // A full implementation would handle all Zod types and modifiers
    
    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      for (const [key, field] of Object.entries(shape)) {
        let currentField = field as any;
        let isOptional = false;
        let description: string | undefined;
        
        // Unwrap optional, nullable, etc.
        while (currentField) {
          if (currentField._def?.description) {
            description = currentField._def.description;
          }
          
          if (currentField instanceof z.ZodOptional) {
            isOptional = true;
            currentField = currentField.unwrap ? currentField.unwrap() : currentField._def?.innerType;
          } else if (currentField instanceof z.ZodDefault) {
            currentField = currentField._def.innerType;
          } else if (currentField instanceof z.ZodNullable) {
            isOptional = true;
            currentField = currentField.unwrap ? currentField.unwrap() : currentField._def?.innerType;
          } else {
            break;
          }
        }
        
        // Determine type
        let type = 'string';
        
        if (currentField instanceof z.ZodString) {
          type = 'string';
        } else if (currentField instanceof z.ZodNumber) {
          type = 'number';
        } else if (currentField instanceof z.ZodBoolean) {
          type = 'boolean';
        } else if (currentField instanceof z.ZodArray) {
          type = 'array';
        } else if (currentField instanceof z.ZodObject) {
          type = 'object';
        }
        
        properties[key] = {
          type,
          description: description || \`\${key} parameter\`
        };
        
        if (!isOptional) {
          required.push(key);
        }
      }
      
      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    }
    
    // Default to simple schema
    return {
      type: 'object',
      properties: {}
    };
  }
}

// Start the server
const server = new MCPServer();
server.start();
`;
  }
  
  /**
   * Generates an MCP SDK server
   * 
   * @param toolImports Tool import statements
   * @param toolInstances Tool instance creation
   * @returns Server content
   */
  private generateSDKServer(toolImports: string, toolInstances: string): string {
    return `#!/usr/bin/env node
import { Server, Tool, CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/transports/stdio';
import { HTTPServerTransport } from '@modelcontextprotocol/sdk/transports/http';
import { MCPTool, ToolContext, ToolResult } from './base-classes';
${toolImports}

/**
 * Adapter to convert our MCPTool to the SDK Tool interface
 */
class ToolAdapter implements Tool {
  private tool: MCPTool;
  private context: ToolContext;
  
  constructor(tool: MCPTool, context: ToolContext) {
    this.tool = tool;
    this.context = context;
  }
  
  get name(): string {
    return this.tool.name;
  }
  
  get description(): string {
    return this.tool.description;
  }
  
  get inputSchema(): any {
    return this.zodToJsonSchema(this.tool.schema);
  }
  
  async call(params: any): Promise<any> {
    try {
      // Validate input against schema
      const validatedInput = this.tool.schema.parse(params);
      
      // Execute tool
      const result = await this.tool.execute(validatedInput, this.context);
      
      return result;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }
  
  /**
   * Converts a Zod schema to JSON Schema
   * 
   * @param schema Zod schema
   * @returns JSON Schema
   */
  private zodToJsonSchema(schema: any): any {
    // This is a simplified implementation
    // A full implementation would handle all Zod types and modifiers
    
    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      const properties: Record<string, any> = {};
      const required: string[] = [];
      
      for (const [key, field] of Object.entries(shape)) {
        let currentField = field as any;
        let isOptional = false;
        let description: string | undefined;
        
        // Unwrap optional, nullable, etc.
        while (currentField) {
          if (currentField._def?.description) {
            description = currentField._def.description;
          }
          
          if (currentField instanceof z.ZodOptional) {
            isOptional = true;
            currentField = currentField.unwrap ? currentField.unwrap() : currentField._def?.innerType;
          } else if (currentField instanceof z.ZodDefault) {
            currentField = currentField._def.innerType;
          } else if (currentField instanceof z.ZodNullable) {
            isOptional = true;
            currentField = currentField.unwrap ? currentField.unwrap() : currentField._def?.innerType;
          } else {
            break;
          }
        }
        
        // Determine type
        let type = 'string';
        
        if (currentField instanceof z.ZodString) {
          type = 'string';
        } else if (currentField instanceof z.ZodNumber) {
          type = 'number';
        } else if (currentField instanceof z.ZodBoolean) {
          type = 'boolean';
        } else if (currentField instanceof z.ZodArray) {
          type = 'array';
        } else if (currentField instanceof z.ZodObject) {
          type = 'object';
        }
        
        properties[key] = {
          type,
          description: description || \`\${key} parameter\`
        };
        
        if (!isOptional) {
          required.push(key);
        }
      }
      
      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    }
    
    // Default to simple schema
    return {
      type: 'object',
      properties: {}
    };
  }
}

/**
 * MCP Server for WebStorm integration
 */
class MCPServer {
  private tools: MCPTool[] = [];
  private context: ToolContext;
  private server: Server;
  
  constructor() {
    this.context = {
      projectRoot: process.cwd(),
      git: this.getGitInfo()
    };
    
    // Create tools
    this.tools = [
  ${toolInstances}
    ];
    
    // Create server
    this.server = new Server({
      name: '${this.options.serverName}',
      version: '${this.options.serverVersion}'
    });
    
    // Register tools
    this.registerTools();
  }
  
  /**
   * Gets git information if available
   */
  private getGitInfo(): { branch?: string; remoteUrl?: string } {
    // This would be implemented to get git info from the environment
    // For now, return empty object
    return {};
  }
  
  /**
   * Registers tools with the server
   */
  private registerTools(): void {
    // Register tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.tools.map(tool => {
          const adapter = new ToolAdapter(tool, this.context);
          return {
            name: adapter.name,
            description: adapter.description,
            inputSchema: adapter.inputSchema
          };
        }),
        nextCursor: undefined
      };
    });
    
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      
      const tool = this.tools.find(t => t.name === name);
      if (!tool) {
        throw new Error(\`Tool "\${name}" not found\`);
      }
      
      const adapter = new ToolAdapter(tool, this.context);
      return adapter.call(args);
    });
  }
  
  /**
   * Starts the server
   */
  start(): void {
    if (${this.options.transport === 'http'}) {
      this.startHttpServer();
    } else {
      this.startStdioServer();
    }
  }
  
  /**
   * Starts an HTTP server
   */
  private startHttpServer(): void {
    const transport = new HTTPServerTransport({
      port: ${this.options.port || 3000}
    });
    
    this.server.listen(transport);
    console.log(\`MCP Server listening on port ${this.options.port || 3000}\`);
  }
  
  /**
   * Starts a stdio server
   */
  private startStdioServer(): void {
    const transport = new StdioServerTransport();
    this.server.listen(transport);
  }
}

// Start the server
const server = new MCPServer();
server.start();
`;
  }
  
  /**
   * Generates the package.json file
   */
  private async generatePackageJson(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'package.json');
    
    const dependencies: Record<string, string> = {
      'zod': '^3.23.8'
    };
    
    // Add SDK dependency if using SDK mode
    if (this.options.mode === ServerMode.SDK) {
      dependencies['@modelcontextprotocol/sdk'] = '^1.15.1';
    }
    
    const content = JSON.stringify({
      name: this.options.serverName,
      version: this.options.serverVersion,
      description: 'MCP Server for WebStorm integration',
      type: 'module',
      main: 'dist/server.js',
      scripts: {
        build: 'tsc',
        start: 'node dist/server.js'
      },
      dependencies
    }, null, 2);
    
    await fs.writeFile(filePath, content, 'utf8');
    this.generatedFiles.push(filePath);
  }
  
  /**
   * Generates the tsconfig.json file
   */
  private async generateTsConfig(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'tsconfig.json');
    
    const content = JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        esModuleInterop: true,
        strict: false,
        skipLibCheck: true,
        outDir: 'dist',
        rootDir: '.',
        declaration: false
      },
      include: ['./**/*.ts'],
      exclude: ['node_modules', 'dist']
    }, null, 2);
    
    await fs.writeFile(filePath, content, 'utf8');
    this.generatedFiles.push(filePath);
  }
}
