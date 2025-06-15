import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse, createServer, Server as HttpServer } from 'node:http';
import { AbstractTransport } from '../base.js';
import { JSONRPCMessage, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpStreamTransportConfig } from './types.js';
import { logger } from '../../core/Logger.js';

export class HttpStreamTransport extends AbstractTransport {
  readonly type = 'http-stream';
  private _isRunning = false;
  private _port: number;
  private _server?: HttpServer;
  private _endpoint: string;
  private _enableJsonResponse: boolean = false;


  private _transports: Map<string, StreamableHTTPServerTransport> = new Map();


  private _serverConfig: any;
  private _serverSetupCallback?: (server: McpServer) => Promise<void>;

  private _pingInterval?: NodeJS.Timeout;
  private _pingTimeouts: Map<string | number, NodeJS.Timeout> = new Map();
  private _pingFrequency: number;
  private _pingTimeout: number;

  constructor(config: HttpStreamTransportConfig = {}) {
    super();

    this._port = config.port || 8080;
    this._endpoint = config.endpoint || '/mcp';
    this._enableJsonResponse = config.responseMode === 'batch';

    this._pingFrequency = config.ping?.frequency ?? 30000; // Default 30 seconds
    this._pingTimeout = config.ping?.timeout ?? 10000; // Default 10 seconds

    logger.debug(
      `HttpStreamTransport configured with: ${JSON.stringify({
        port: this._port,
        endpoint: this._endpoint,
        responseMode: config.responseMode,
        batchTimeout: config.batchTimeout,
        maxMessageSize: config.maxMessageSize,
        auth: config.auth ? true : false,
        cors: config.cors ? true : false,
        ping: {
          frequency: this._pingFrequency,
          timeout: this._pingTimeout,
        },
      })}`
    );
  }


  setServerConfig(serverConfig: any, setupCallback: (server: McpServer) => Promise<void>): void {
    this._serverConfig = serverConfig;
    this._serverSetupCallback = setupCallback;
  }

  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error('HttpStreamTransport already started');
    }

    return new Promise((resolve, reject) => {
      this._server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://${req.headers.host}`);

          if (url.pathname === this._endpoint) {
            await this.handleMcpRequest(req, res);
          } else {
            res.writeHead(404).end('Not Found');
          }
        } catch (error) {
          logger.error(`Error handling request: ${error}`);
          if (!res.headersSent) {
            res.writeHead(500).end('Internal Server Error');
          }
        }
      });

      this._server.on('error', (error) => {
        logger.error(`HTTP server error: ${error}`);
        this._onerror?.(error);
        if (!this._isRunning) {
          reject(error);
        }
      });

      this._server.on('close', () => {
        logger.info('HTTP server closed');
        this._isRunning = false;
        this._onclose?.();
      });

      this._server.listen(this._port, () => {
        logger.info(`HTTP server listening on port ${this._port}, endpoint ${this._endpoint}`);
        this._isRunning = true;
        this.startPingInterval();
        resolve();
      });
    });
  }

  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && this._transports.has(sessionId)) {
      transport = this._transports.get(sessionId)!;
      logger.debug(`Reusing existing session: ${sessionId}`);
    } else if (!sessionId && req.method === 'POST') {
      const body = await this.readRequestBody(req);

      if (isInitializeRequest(body)) {
        logger.info('Creating new session for initialization request');

        if (!this._serverSetupCallback || !this._serverConfig) {
          logger.error('No server configuration available');
          this.sendError(
            res,
            500,
            -32603,
            'Internal server error: No server configuration available'
          );
          return;
        }

        try {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              logger.info(`Session initialized: ${sessionId}`);
              // Store the transport by session ID
              this._transports.set(sessionId, transport);
            },
            enableJsonResponse: this._enableJsonResponse,
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              logger.info(`Transport closed for session: ${transport.sessionId}`);
              this._transports.delete(transport.sessionId);
            }
          };

          const server = new McpServer(this._serverConfig);

          await this._serverSetupCallback(server);

          await server.connect(transport);

          await transport.handleRequest(req, res, body);
          return;
        } catch (error) {
          logger.error(`Failed to create session: ${error}`);
          this.sendError(res, 500, -32603, 'Internal server error: Failed to create session');
          return;
        }
      } else {
        this.sendError(res, 400, -32000, 'Bad Request: No valid session ID provided');
        return;
      }
    } else if (!sessionId) {
      this.sendError(res, 400, -32000, 'Bad Request: No valid session ID provided');
      return;
    } else {
      this.sendError(res, 404, -32001, 'Session not found');
      return;
    }

    const body = await this.readRequestBody(req);
    await transport.handleRequest(req, res, body);
  }

  private async readRequestBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  private sendError(res: ServerResponse, status: number, code: number, message: string): void {
    if (res.headersSent) return;

    res.writeHead(status).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code,
          message,
        },
        id: null,
      })
    );
  }

  private startPingInterval(): void {
    if (this._pingFrequency > 0) {
      logger.debug(
        `Starting ping interval with frequency ${this._pingFrequency}ms and timeout ${this._pingTimeout}ms`
      );
      this._pingInterval = setInterval(() => this.sendPing(), this._pingFrequency);
    }
  }

  private async sendPing(): Promise<void> {
    if (!this._isRunning || this._transports.size === 0) {
      return;
    }

    const pingId = `ping-${Date.now()}`;
    const pingRequest: JSONRPCMessage = {
      jsonrpc: '2.0' as const,
      id: pingId,
      method: 'ping',
    };

    logger.debug(
      `Broadcasting ping to ${this._transports.size} sessions: ${JSON.stringify(pingRequest)}`
    );

    const timeoutId = setTimeout(() => {
      logger.warn(`Ping ${pingId} timed out after ${this._pingTimeout}ms`);
      this._pingTimeouts.delete(pingId);
    }, this._pingTimeout);

    this._pingTimeouts.set(pingId, timeoutId);

    const failedSessions: string[] = [];
    for (const [sessionId, transport] of this._transports.entries()) {
      try {
        await transport.send(pingRequest);
      } catch (error) {
        logger.error(`Error sending ping to session ${sessionId}: ${error}`);
        failedSessions.push(sessionId);
      }
    }

    for (const sessionId of failedSessions) {
      this._transports.delete(sessionId);
    }
  }

  private handlePingMessage(message: JSONRPCMessage): boolean {
    if ('method' in message && message.method === 'ping') {
      const id = 'id' in message ? message.id : undefined;
      logger.debug(`Received ping request: ${JSON.stringify(message)}`);

      if (id !== undefined) {
        const response = {
          jsonrpc: '2.0' as const,
          id: id,
          result: {},
        };
        logger.debug(`Sending ping response: ${JSON.stringify(response)}`);

        const firstTransport = this._transports.values().next().value;
        if (firstTransport) {
          firstTransport
            .send(response)
            .catch((error: any) => logger.error(`Error responding to ping: ${error}`));
        }
      }

      return true;
    }

    if (
      'id' in message &&
      message.id &&
      typeof message.id === 'string' &&
      message.id.startsWith('ping-') &&
      'result' in message
    ) {
      logger.debug(`Received ping response: ${JSON.stringify(message)}`);

      const timeoutId = this._pingTimeouts.get(message.id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this._pingTimeouts.delete(message.id);
        logger.debug(`Cleared timeout for ping response: ${message.id}`);
      }

      return true;
    }

    return false;
  }

  async handleRequest(req: IncomingMessage, res: ServerResponse, body?: any): Promise<void> {
    await this.handleMcpRequest(req, res);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._transports.size === 0) {
      logger.warn('Attempted to send message, but no clients are connected.');
      return;
    }

    logger.debug(
      `Broadcasting message to ${this._transports.size} sessions: ${JSON.stringify(message)}`
    );

    const failedSessions: string[] = [];
    for (const [sessionId, transport] of this._transports.entries()) {
      try {
        await transport.send(message);
      } catch (error) {
        logger.error(`Error sending message to session ${sessionId}: ${error}`);
        failedSessions.push(sessionId);
      }
    }

    for (const sessionId of failedSessions) {
      this._transports.delete(sessionId);
    }

    if (failedSessions.length > 0) {
      logger.warn(`Failed to send message to ${failedSessions.length} sessions.`);
    }
  }

  async close(): Promise<void> {
    if (!this._isRunning) {
      return;
    }

    this._isRunning = false;

    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = undefined;
    }

    for (const timeoutId of this._pingTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this._pingTimeouts.clear();

    logger.info(`Closing ${this._transports.size} sessions`);
    for (const [sessionId, transport] of this._transports.entries()) {
      try {
        await transport.close();
      } catch (error) {
        logger.error(`Error closing session ${sessionId}: ${error}`);
      }
    }
    this._transports.clear();

    return new Promise((resolve) => {
      if (!this._server) {
        resolve();
        return;
      }

      this._server.close(() => {
        logger.info('HTTP server stopped');
        this._server = undefined;
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this._isRunning && !!this._server;
  }
}
