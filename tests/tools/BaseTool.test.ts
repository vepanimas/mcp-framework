import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

interface TestToolInput {
  message: string;
  count?: number;
}

class TestTool extends MCPTool<TestToolInput> {
  name = 'test_tool';
  description = 'A tool for testing BaseTool functionality';

  protected schema = {
    message: {
      type: z.string(),
      description: 'Test message parameter',
    },
    count: {
      type: z.number().optional(),
      description: 'Optional count parameter',
    },
  };

  protected async execute(input: TestToolInput): Promise<unknown> {
    return {
      received: input.message,
      count: input.count ?? 0,
    };
  }
}

// Create a more comprehensive tool for testing all schema types
interface ComprehensiveToolInput {
  stringField: string;
  numberField: number;
  booleanField: boolean;
  arrayField: string[];
  objectField: { key: string };
  optionalString?: string;
  optionalNumber?: number;
}

class ComprehensiveTool extends MCPTool<ComprehensiveToolInput> {
  name = 'comprehensive_tool';
  description = 'A tool for testing all schema types';

  protected schema = {
    stringField: {
      type: z.string(),
      description: 'String field',
    },
    numberField: {
      type: z.number(),
      description: 'Number field',
    },
    booleanField: {
      type: z.boolean(),
      description: 'Boolean field',
    },
    arrayField: {
      type: z.array(z.string()),
      description: 'Array field',
    },
    objectField: {
      type: z.object({ key: z.string() }),
      description: 'Object field',
    },
    optionalString: {
      type: z.string().optional(),
      description: 'Optional string field',
    },
    optionalNumber: {
      type: z.number().optional(),
      description: 'Optional number field',
    },
  };

  protected async execute(input: ComprehensiveToolInput): Promise<unknown> {
    return { processed: true, input };
  }
}

describe('BaseTool', () => {
  let testTool: TestTool;

  beforeEach(() => {
    testTool = new TestTool();
  });

  describe('toolDefinition', () => {
    it('should generate correct tool definition', () => {
      const definition = testTool.toolDefinition;

      expect(definition).toEqual({
        name: 'test_tool',
        description: 'A tool for testing BaseTool functionality',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Test message parameter',
            },
            count: {
              type: 'number',
              description: 'Optional count parameter',
            },
          },
          required: ['message'],
        },
      });
    });
  });

  describe('JSON Schema Type Generation', () => {
    let comprehensiveTool: ComprehensiveTool;

    beforeEach(() => {
      comprehensiveTool = new ComprehensiveTool();
    });

    it('should correctly map Zod types to JSON schema types', () => {
      const { properties } = comprehensiveTool.inputSchema;

      expect(properties).toBeDefined();
      expect(properties!.stringField).toEqual({
        type: 'string',
        description: 'String field',
      });
      expect(properties!.numberField).toEqual({
        type: 'number',
        description: 'Number field',
      });
      expect(properties!.booleanField).toEqual({
        type: 'boolean',
        description: 'Boolean field',
      });
      expect(properties!.arrayField).toEqual({
        type: 'array',
        description: 'Array field',
      });
      expect(properties!.objectField).toEqual({
        type: 'object',
        description: 'Object field',
      });
    });

    it('should correctly handle optional types', () => {
      const { properties, required } = comprehensiveTool.inputSchema;

      // Optional fields should still have correct types
      expect(properties!.optionalString).toEqual({
        type: 'string',
        description: 'Optional string field',
      });
      expect(properties!.optionalNumber).toEqual({
        type: 'number',
        description: 'Optional number field',
      });

      // Required fields should not include optional ones
      expect(required).toEqual([
        'stringField',
        'numberField',
        'booleanField',
        'arrayField',
        'objectField',
      ]);
      expect(required).not.toContain('optionalString');
      expect(required).not.toContain('optionalNumber');
    });

    it('should specifically verify number types are not strings', () => {
      const { properties } = comprehensiveTool.inputSchema;

      // This is the critical test - numbers should be "number", not "string"
      expect((properties!.numberField as any).type).toBe('number');
      expect((properties!.numberField as any).type).not.toBe('string');
      expect((properties!.optionalNumber as any).type).toBe('number');
      expect((properties!.optionalNumber as any).type).not.toBe('string');
    });

    it('should generate MCP-compliant tool definition with correct number types', () => {
      // Create a simple tool with various number types to test client compatibility
      interface NumberTestInput {
        age: number;
        price: number;
        weight?: number;
      }

      class NumberTestTool extends MCPTool<NumberTestInput> {
        name = 'number_test_tool';
        description = 'Tool for testing number parameter types in MCP clients';

        protected schema = {
          age: {
            type: z.number().int().positive(),
            description: 'Age in years (positive integer)',
          },
          price: {
            type: z.number().positive(),
            description: 'Price in dollars (positive number)',
          },
          weight: {
            type: z.number().optional(),
            description: 'Weight in kg (optional)',
          },
        };

        protected async execute(input: NumberTestInput): Promise<unknown> {
          return { received: input };
        }
      }

      const tool = new NumberTestTool();
      const definition = tool.toolDefinition;

      // Verify the tool definition structure matches MCP spec
      expect(definition).toHaveProperty('name', 'number_test_tool');
      expect(definition).toHaveProperty('description');
      expect(definition).toHaveProperty('inputSchema');
      expect(definition.inputSchema).toHaveProperty('type', 'object');
      expect(definition.inputSchema).toHaveProperty('properties');
      expect(definition.inputSchema).toHaveProperty('required');

      // Verify number types are correctly specified
      const { properties, required } = definition.inputSchema;

      expect((properties!.age as any).type).toBe('number');
      expect((properties!.price as any).type).toBe('number');
      expect((properties!.weight as any).type).toBe('number');

      // Verify required fields
      expect(required).toContain('age');
      expect(required).toContain('price');
      expect(required).not.toContain('weight');

      // Log the definition for debugging client issues
      console.log('MCP Tool Definition for client debugging:');
      console.log(JSON.stringify(definition, null, 2));
    });
  });

  describe('toolCall', () => {
    it('should execute successfully with valid input', async () => {
      const response = await testTool.toolCall({
        params: {
          name: 'test_tool',
          arguments: {
            message: 'Hello, World!',
            count: 42,
          },
        },
      });

      expect(response.content).toBeDefined();
      expect(response.content[0]).toEqual({
        type: 'text',
        text: '{"received":"Hello, World!","count":42}',
      });
    });

    it('should handle optional parameters', async () => {
      const response = await testTool.toolCall({
        params: {
          name: 'test_tool',
          arguments: {
            message: 'Test without count',
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0]).toEqual({
        type: 'text',
        text: '{"received":"Test without count","count":0}',
      });
    });

    it('should return error response for invalid input', async () => {
      const response = await testTool.toolCall({
        params: {
          name: 'test_tool',
          arguments: {
            count: 10,
          },
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('error');
      expect((response.content[0] as any).text).toContain('Required');
    });

    it('should handle empty arguments', async () => {
      const response = await testTool.toolCall({
        params: {
          name: 'test_tool',
        },
      });

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('error');
    });
  });

  describe('inputSchema', () => {
    it('should correctly identify required fields', () => {
      const { required } = testTool.inputSchema;
      expect(required).toEqual(['message']);
    });

    it('should include all defined properties', () => {
      const { properties } = testTool.inputSchema;
      expect(Object.keys(properties!)).toEqual(['message', 'count']);
    });
  });
});
