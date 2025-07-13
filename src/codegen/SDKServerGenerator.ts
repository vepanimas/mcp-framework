import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { ToolInfo } from './ToolDiscovery.js';

/**
 * Options for server generation
 */
export interface ServerGeneratorOptions {
  /** Project root directory */
  projectRoot: string;
  /** Output directory for the generated server */
  outputDir: string;
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
 * using the official MCP SDK
 */
export class SDKServerGenerator {
  private options: ServerGeneratorOptions;
  private errors: string[] = [];
  private generatedFiles: string[] = [];

  /**
   * Creates a new SDKServerGenerator instance
   *
   * @param options Server generator options
   */
  constructor(options: ServerGeneratorOptions) {
    this.options = {
      ...options,
      outputDir: path.resolve(options.projectRoot, options.outputDir),
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
        errors: this.errors,
      };
    } catch (error) {
      this.errors.push(
        `Error generating server: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        outputDir: this.options.outputDir,
        generatedFiles: this.generatedFiles,
        errors: this.errors,
      };
    }
  }

  /**
   * Generates the base classes file
   */
  private async generateBaseClasses(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'base-classes.ts');

    const content = `import { Tool, McpError, ErrorCode } from '@modelcontextprotocol/sdk';
import { z } from 'zod';

/**
 * Base class for MCP tools using Zod schemas for input validation and type inference.
 * Directly implements the SDK's Tool interface.
 */
export abstract class SDKTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodType;

  /**
   * Get the input schema in JSON Schema format
   */
  get inputSchema(): any {
    return this.zodToJsonSchema(this.schema);
  }

  /**
   * Execute the tool with the provided input
   * 
   * @param params Tool parameters
   * @returns Tool result
   */
  async call(params: any): Promise<any> {
    try {
      // Validate input against schema
      const validatedInput = this.schema.parse(params);
      
      // Execute tool
      return await this.execute(validatedInput);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new McpError(
          ErrorCode.InvalidParams,
          \`Invalid arguments for tool \${this.name}: \${error.message}\`,
          { zodError: error.format() }
        );
      }
      
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Execute the tool with validated input
   * 
   * @param input Validated input
   * @returns Tool result
   */
  protected abstract execute(input: z.infer<typeof this.schema>): Promise<any>;

  /**
   * Converts a Zod schema to JSON Schema
   * 
   * @param schema Zod schema
   * @returns JSON Schema
   */
  private zodToJsonSchema(schema: z.ZodType): any {
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
 * Type helper to infer the input type from a tool's schema
 */
export type ToolInput<T extends SDKTool> = z.infer<T['schema']>;
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
    const toolImports = tools
      .map((tool) => {
        const relativePath = tool.filePath.replace(/\.ts$/, '');
        return `import { ${tool.className} } from './${relativePath}';`;
      })
      .join('\n');

    // Generate tool instances
    const toolInstances = tools.map((tool) => `new ${tool.className}()`).join(',\n  ');

    const serverContent = `#!/usr/bin/env node
import { Server, Tool, McpError, ErrorCode } from '@modelcontextprotocol/sdk';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/transports/stdio';
import { HTTPServerTransport } from '@modelcontextprotocol/sdk/transports/http';
import { SDKTool } from './base-classes';
${toolImports}

/**
 * MCP Server implementation using the SDK directly
 */
class SDKServer {
  private server: Server;
  private tools: Tool[] = [];
  private toolMap = new Map<string, Tool>();
  private isRunning = false;
  
  constructor() {
    // Create tools
    this.tools = [
  ${toolInstances}
    ];
    
    // Create tool map for quick lookup
    for (const tool of this.tools) {
      this.toolMap.set(tool.name, tool);
    }
    
    // Create server
    this.server = new Server({
      name: '${this.options.serverName}',
      version: '${this.options.serverVersion}'
    });
    
    // Register request handlers
    this.setupHandlers();
  }
  
  /**
   * Sets up request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      }));
      
      return {
        tools,
        nextCursor: undefined
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      
      const tool = this.toolMap.get(name);
      if (!tool) {
        throw new McpError(
          ErrorCode.InvalidParams,
          \`Tool \${name} not found\`,
          { availableTools: Array.from(this.toolMap.keys()) }
        );
      }
      
      try {
        return await tool.call(args);
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          \`Tool execution failed: \${error instanceof Error ? error.message : String(error)}\`
        );
      }
    });
  }
  
  /**
   * Starts the server
   */
  start(): void {
    if (this.isRunning) {
      console.error('Server is already running');
      return;
    }
    
    this.isRunning = true;
    
    // Create transport
    const transport = this.createTransport();
    
    // Start server
    this.server.listen(transport);
    
    console.log(\`MCP Server started with \${${this.options.transport === 'http'} ? 'HTTP' : 'stdio'} transport\`);
  }
  
  /**
   * Creates a transport based on configuration
   */
  private createTransport(): any {
    if (${this.options.transport === 'http'}) {
      return new HTTPServerTransport({ port: ${this.options.port || 3000} });
    } else {
      return new StdioServerTransport();
    }
  }
}

// Start the server
const server = new SDKServer();
server.start();
`;

    await fs.writeFile(filePath, serverContent, 'utf8');
    this.generatedFiles.push(filePath);
  }

  /**
   * Generates the package.json file
   */
  private async generatePackageJson(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'package.json');

    const content = JSON.stringify(
      {
        name: this.options.serverName,
        version: this.options.serverVersion,
        description: 'MCP Server for WebStorm integration',
        type: 'module',
        main: 'dist/server.js',
        scripts: {
          build: 'tsc',
          start: 'node dist/server.js',
        },
        dependencies: {
          '@modelcontextprotocol/sdk': '^1.15.1',
          zod: '^3.23.8',
        },
      },
      null,
      2
    );

    await fs.writeFile(filePath, content, 'utf8');
    this.generatedFiles.push(filePath);
  }

  /**
   * Generates the tsconfig.json file
   */
  private async generateTsConfig(): Promise<void> {
    const filePath = path.join(this.options.outputDir, 'tsconfig.json');

    const content = JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          esModuleInterop: true,
          strict: false,
          skipLibCheck: true,
          outDir: 'dist',
          rootDir: '.',
          declaration: false,
        },
        include: ['./**/*.ts'],
        exclude: ['node_modules', 'dist'],
      },
      null,
      2
    );

    await fs.writeFile(filePath, content, 'utf8');
    this.generatedFiles.push(filePath);
  }
}
