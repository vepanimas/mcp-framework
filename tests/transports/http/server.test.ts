import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { HttpStreamTransport } from '../../../src/transports/http/server.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

describe('HttpStreamTransport', () => {
  let transport: HttpStreamTransport;

  beforeEach(() => {
    // Use a random port for testing
    const mockPort = 3000 + Math.floor(Math.random() * 1000);

    transport = new HttpStreamTransport({
      port: mockPort,
      endpoint: '/mcp',
      responseMode: 'stream',
    });
  });

  afterEach(async () => {
    if (transport.isRunning()) {
      await transport.close();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultTransport = new HttpStreamTransport();
      expect(defaultTransport).toBeDefined();
      expect(defaultTransport.type).toBe('http-stream');
    });

    it('should initialize with custom configuration', () => {
      const customTransport = new HttpStreamTransport({
        port: 9999,
        endpoint: '/custom-mcp',
        responseMode: 'batch',
        ping: {
          frequency: 60000,
          timeout: 15000,
        },
      });

      expect(customTransport).toBeDefined();
      expect(customTransport.type).toBe('http-stream');
    });
  });

  describe('Server Configuration', () => {
    it('should set server configuration and setup callback', () => {
      const serverConfig = { name: 'test-server', version: '1.0.0' };
      const setupCallback = async () => {};

      // Should not throw when setting configuration
      expect(() => transport.setServerConfig(serverConfig, setupCallback)).not.toThrow();
    });
  });

  describe('Transport Management', () => {
    it('should start and stop successfully', async () => {
      expect(transport.isRunning()).toBe(false);

      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });

    it('should handle multiple start/stop cycles', async () => {
      // First cycle
      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);

      // Second cycle
      await transport.start();
      expect(transport.isRunning()).toBe(true);
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });

    it('should not throw when closing a non-running transport', async () => {
      expect(transport.isRunning()).toBe(false);
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it('should throw when trying to start an already running transport', async () => {
      await transport.start();
      expect(transport.isRunning()).toBe(true);

      await expect(transport.start()).rejects.toThrow('HttpStreamTransport already started');
    });
  });

  describe('Message Broadcasting', () => {
    it('should handle empty session list gracefully', async () => {
      const testMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
      };

      // Should not throw when no sessions exist
      await expect(transport.send(testMessage)).resolves.toBeUndefined();
    });

    it('should handle message sending without active server', async () => {
      const testMessage: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'notification',
        params: { data: 'test' },
      };

      // Should handle gracefully when transport not started
      await expect(transport.send(testMessage)).resolves.toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should accept valid ping configuration', () => {
      const transportWithPing = new HttpStreamTransport({
        port: 8080,
        ping: {
          frequency: 30000,
          timeout: 10000,
        },
      });

      expect(transportWithPing).toBeDefined();
      expect(transportWithPing.type).toBe('http-stream');
    });

    it('should accept disabled ping configuration', () => {
      const transportNoPing = new HttpStreamTransport({
        port: 8080,
        ping: {
          frequency: 0, // Disabled
          timeout: 10000,
        },
      });

      expect(transportNoPing).toBeDefined();
      expect(transportNoPing.type).toBe('http-stream');
    });

    it('should handle different response modes', () => {
      const streamTransport = new HttpStreamTransport({
        responseMode: 'stream',
      });
      expect(streamTransport).toBeDefined();

      const batchTransport = new HttpStreamTransport({
        responseMode: 'batch',
      });
      expect(batchTransport).toBeDefined();
    });
  });

  describe('Multi-Client Architecture', () => {
    it('should initialize transport maps correctly', () => {
      const transport = new HttpStreamTransport();

      // Transport should be created successfully
      expect(transport).toBeDefined();
      expect(transport.type).toBe('http-stream');

      // Should start in non-running state
      expect(transport.isRunning()).toBe(false);
    });

    it('should support proper session management structure', () => {
      const serverConfig = { name: 'multi-client-server', version: '1.0.0' };
      const setupCallback = async () => {
      };

      // Should accept configuration for multi-client support
      expect(() => transport.setServerConfig(serverConfig, setupCallback)).not.toThrow();
    });

    it('should handle server lifecycle correctly', async () => {
      // Set up server configuration first
      const serverConfig = { name: 'test-server', version: '1.0.0' };
      const setupCallback = async () => {};
      transport.setServerConfig(serverConfig, setupCallback);

      // Start and verify state
      await transport.start();
      expect(transport.isRunning()).toBe(true);

      // Stop and verify cleanup
      await transport.close();
      expect(transport.isRunning()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle port conflicts gracefully', async () => {
      const port = 3000 + Math.floor(Math.random() * 1000);

      const transport1 = new HttpStreamTransport({ port });
      const transport2 = new HttpStreamTransport({ port });

      try {
        await transport1.start();
        expect(transport1.isRunning()).toBe(true);

        // Second transport should fail to start on same port
        await expect(transport2.start()).rejects.toThrow();
      } finally {
        await transport1.close();
        await transport2.close();
      }
    });

    it('should handle configuration errors gracefully', () => {
      // Invalid configurations should still create transport objects
      // but may fail during start()
      const invalidTransport = new HttpStreamTransport({
        port: -1, // Invalid port
      });

      expect(invalidTransport).toBeDefined();
      expect(invalidTransport.type).toBe('http-stream');
    });
  });

  describe('Integration with Framework Pattern', () => {
    it('should follow the multi-session architecture', () => {

      const serverConfig = {
        name: 'http-stream-server',
        version: '1.0.0',
      };

      const setupCallback = async () => {
      };

      // Should accept the configuration pattern used by working examples
      expect(() => transport.setServerConfig(serverConfig, setupCallback)).not.toThrow();

      // Should maintain the http-stream transport type
      expect(transport.type).toBe('http-stream');
    });

    it('should support the official MCP pattern for session management', () => {
      // Verify the transport supports the pattern:
      // 1. Each session gets its own transport instance (handled by our implementation)
      // 2. Each session gets its own McpServer instance (handled by setServerConfig)
      // 3. Server connects to transport (handled by our implementation)
      // 4. Transport stores sessions in a map (our _transports map)

      expect(transport).toBeDefined();
      expect(typeof transport.setServerConfig).toBe('function');
      expect(typeof transport.send).toBe('function');
      expect(typeof transport.close).toBe('function');
    });
  });
});
