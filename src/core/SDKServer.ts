import { Server, Tool, McpError, ErrorCode } from '@modelcontextprotocol/sdk';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/transports/stdio';
import { HTTPServerTransport } from '@modelcontextprotocol/sdk/transports/http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from './Logger.js';
import { SDKToolLoader } from '../loaders/SDKToolLoader.js';

/**
 * Configuration for the SDK server
 */
export interface SDKServerConfig {
  /** Server name */
  name?: string;
  /** Server version */
  version?: string;
  /** Base path for component discovery */
  basePath?: string;
  /** Transport configuration */
  transport?: {
    /** Transport type */
    type: 'stdio' | 'http';
    /** HTTP port (only used with HTTP transport) */
    port?: number;
  };
}

/**
 * MCP Server implementation using the SDK directly
 */
export class SDKServer {
  private server!: Server;
  private toolsMap: Map<string, Tool> = new Map();
  private toolLoader: SDKToolLoader;
  private serverName: string;
  private serverVersion: string;
  private basePath: string;
  private transportConfig: { type: 'stdio' | 'http'; port?: number };
  private isRunning: boolean = false;
  private shutdownPromise?: Promise<void>;
  private shutdownResolve?: () => void;

  /**
   * Creates a new SDK server
   *
   * @param config Server configuration
   */
  constructor(config: SDKServerConfig = {}) {
    this.basePath = this.resolveBasePath(config.basePath);
    this.serverName = config.name ?? this.getDefaultName();
    this.serverVersion = config.version ?? this.getDefaultVersion();
    this.transportConfig = config.transport ?? { type: 'stdio' };

    logger.info(`Initializing SDK Server: ${this.serverName}@${this.serverVersion}`);
    logger.debug(`Base path: ${this.basePath}`);
    logger.debug(`Transport config: ${JSON.stringify(this.transportConfig)}`);

    this.toolLoader = new SDKToolLoader(this.basePath);
  }

  /**
   * Resolves the base path for component discovery
   *
   * @param configPath Base path from configuration
   * @returns Resolved base path
   */
  private resolveBasePath(configPath?: string): string {
    if (configPath) {
      return configPath;
    }
    if (process.argv[1]) {
      return dirname(process.argv[1]);
    }
    return process.cwd();
  }

  /**
   * Gets the default server name from package.json
   *
   * @returns Default server name
   */
  private getDefaultName(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.name) {
      return packageJson.name;
    }
    logger.error("Couldn't find project name in package json");
    return 'unnamed-mcp-server';
  }

  /**
   * Gets the default server version from package.json
   *
   * @returns Default server version
   */
  private getDefaultVersion(): string {
    const packageJson = this.readPackageJson();
    if (packageJson?.version) {
      return packageJson.version;
    }
    return '0.0.0';
  }

  /**
   * Reads the package.json file
   *
   * @returns Package.json content
   */
  private readPackageJson(): any {
    try {
      const projectRoot = process.cwd();
      const packagePath = join(projectRoot, 'package.json');

      try {
        const packageContent = readFileSync(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        logger.debug(`Successfully read package.json from project root: ${packagePath}`);
        return packageJson;
      } catch (error) {
        logger.warn(`Could not read package.json from project root: ${error}`);
        return null;
      }
    } catch (error) {
      logger.warn(`Could not read package.json: ${error}`);
      return null;
    }
  }

  /**
   * Starts the server
   */
  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        throw new McpError(ErrorCode.InternalError, 'Server is already running');
      }
      this.isRunning = true;

      logger.info(`Starting SDK server: ${this.serverName}@${this.serverVersion}...`);

      // Load tools
      const tools = await this.toolLoader.loadTools();
      this.toolsMap = new Map(tools.map((tool: Tool) => [tool.name, tool]));

      logger.info(`Loaded ${tools.length} tools: ${tools.map((t) => t.name).join(', ') || 'None'}`);

      // Create server
      this.server = new Server({
        name: this.serverName,
        version: this.serverVersion,
      });

      // Set up request handlers
      this.setupHandlers();

      // Create transport
      const transport = this.createTransport();

      // Start server
      logger.info(`Starting server with ${this.transportConfig.type} transport...`);
      await this.server.listen(transport);

      logger.info(`Server started successfully`);

      // Set up shutdown promise
      this.shutdownPromise = new Promise((resolve) => {
        this.shutdownResolve = resolve;
      });

      // Set up signal handlers
      this.setupSignalHandlers();

      // Wait for shutdown
      await this.shutdownPromise;
    } catch (error) {
      logger.error(
        `Server failed to start: ${error instanceof Error ? error.message : String(error)}`
      );
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Sets up request handlers
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Received ListTools request');

      const tools = Array.from(this.toolsMap.values()).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      logger.debug(`Returning ${tools.length} tools`);

      return {
        tools,
        nextCursor: undefined,
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      logger.debug(`Received CallTool request for ${name}`);

      const tool = this.toolsMap.get(name);
      if (!tool) {
        logger.error(`Tool not found: ${name}`);
        throw new McpError(ErrorCode.InvalidParams, `Tool ${name} not found`, {
          availableTools: Array.from(this.toolsMap.keys()),
        });
      }

      try {
        logger.debug(`Calling tool ${name} with args: ${JSON.stringify(args)}`);
        const result = await tool.call(args);
        logger.debug(`Tool ${name} returned: ${JSON.stringify(result)}`);
        return result;
      } catch (error) {
        if (error instanceof McpError) {
          logger.error(`Tool ${name} failed with McpError: ${error.message}`);
          throw error;
        }

        logger.error(
          `Tool ${name} failed: ${error instanceof Error ? error.message : String(error)}`
        );
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  /**
   * Creates a transport based on configuration
   *
   * @returns Transport instance
   */
  private createTransport(): any {
    if (this.transportConfig.type === 'http') {
      const port = this.transportConfig.port || 3000;
      logger.info(`Creating HTTP transport on port ${port}`);
      return new HTTPServerTransport({ port });
    } else {
      logger.info('Creating stdio transport');
      return new StdioServerTransport();
    }
  }

  /**
   * Sets up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleSignal = async (signal: string) => {
      if (!this.isRunning) return;
      logger.info(`Received ${signal}. Shutting down...`);
      try {
        await this.stop();
      } catch (e: any) {
        logger.error(`Shutdown error via ${signal}: ${e.message}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
  }

  /**
   * Stops the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.debug('Stop called, but server not running.');
      return;
    }

    try {
      logger.info('Stopping server...');

      if (this.server) {
        try {
          logger.debug('Closing SDK Server...');
          await this.server.close();
          logger.info('SDK Server closed.');
        } catch (e: any) {
          logger.error(`Error closing SDK Server: ${e.message}`);
        }
      }

      this.isRunning = false;

      if (this.shutdownResolve) {
        this.shutdownResolve();
        logger.debug('Shutdown promise resolved.');
      } else {
        logger.warn('Shutdown resolve function not found.');
      }

      logger.info('SDK server stopped successfully.');
    } catch (error) {
      logger.error(`Error stopping server: ${error}`);
      throw error;
    }
  }

  /**
   * Checks if the server is running
   */
  get IsRunning(): boolean {
    return this.isRunning;
  }
}
