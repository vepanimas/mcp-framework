import { Tool, McpError, ErrorCode } from '@modelcontextprotocol/sdk';
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
          `Invalid arguments for tool ${this.name}: ${error.message}`,
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
            currentField = currentField.unwrap
              ? currentField.unwrap()
              : currentField._def?.innerType;
          } else if (currentField instanceof z.ZodDefault) {
            currentField = currentField._def.innerType;
          } else if (currentField instanceof z.ZodNullable) {
            isOptional = true;
            currentField = currentField.unwrap
              ? currentField.unwrap()
              : currentField._def?.innerType;
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
          description: description || `${key} parameter`,
        };

        if (!isOptional) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    // Default to simple schema
    return {
      type: 'object',
      properties: {},
    };
  }
}

/**
 * Type helper to infer the input type from a tool's schema
 */
export type ToolInput<T extends SDKTool> = z.infer<T['schema']>;
