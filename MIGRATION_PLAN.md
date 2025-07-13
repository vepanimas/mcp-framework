# MCP SDK Migration Plan

This document outlines the plan for migrating the MCP Framework to use the official MCP SDK directly, without custom implementations or adapters.

## Overview

The current MCP Framework uses a hybrid approach, with both custom implementations and SDK integration. This migration plan aims to eliminate the custom implementations and use the SDK directly, prioritizing efficiency over backward compatibility.

## 1. Core Component Migrations

### 1.1 New SDKTool Base Class

Create a new `SDKTool` base class that directly implements the SDK's `Tool` interface:

```typescript
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
    // Implementation from ServerGenerator.ts
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
          description: description || `${key} parameter`
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
```

### 1.2 MCPServer Updates

Update `MCPServer.ts` to use SDK components directly:

1. Remove custom transport abstractions
2. Use SDK transports directly
3. Simplify request handling to use SDK interfaces directly
4. Use McpError with appropriate ErrorCode values for error handling

### 1.3 Component Loader Updates

Update component loaders to work with SDK interfaces:

1. Modify `ToolLoader` to load SDK-compatible tools
2. Update validation to match SDK requirements
3. Remove custom adapters and wrappers

## 2. CLI and Build System Migrations

### 2.1 ServerGenerator Updates

Update `ServerGenerator.ts` to only generate SDK-based servers:

1. Remove `ServerMode.SIMPLE` option entirely
2. Remove the `generateSimpleServer` method
3. Rename `generateSDKServer` to `generateServer`
4. Update the `generateServer` method to use the new `SDKTool` base class

### 2.2 CLI Command Updates

Modify CLI commands to assume SDK mode:

1. Remove mode options from CLI commands
2. Update help text to reflect SDK-only approach
3. Update build pipeline to use SDK-specific validation

## 3. Developer Experience Improvements

### 3.1 Zod Schema Integration

Create SDK-compatible Zod schema integration:

1. Maintain the `zodToJsonSchema` conversion for Zod schema support
2. Ensure proper error handling for Zod validation errors
3. Provide type inference for Zod schemas

### 3.2 Error Handling

Implement SDK error handling with McpError:

1. Use McpError with appropriate ErrorCode values for error handling
2. Use InvalidParams for validation errors
3. Use InternalError for execution errors
4. Use other error codes as appropriate

### 3.3 Type Safety

Maintain type safety and inference where possible:

1. Provide type helpers for tool input inference
2. Ensure proper typing for SDK interfaces
3. Maintain type safety for tool execution

## 4. Testing and Documentation

### 4.1 Test Updates

Update tests for SDK-only implementation:

1. Update all existing tests to use the new `SDKTool` base class
2. Create new tests for SDK-specific functionality
3. Ensure all tests pass with the new implementation

### 4.2 Documentation Updates

Update documentation to reflect SDK-only approach:

1. Update README.md with new usage instructions
2. Update ARCHITECTURE.md to reflect the new architecture
3. Create a migration guide for existing users

## Implementation Roadmap

1. Create the new `SDKTool` base class
2. Update MCPServer.ts to use SDK components directly
3. Update component loaders to work with SDK interfaces
4. Update ServerGenerator.ts to only generate SDK-based servers
5. Modify CLI commands to assume SDK mode
6. Update tests and documentation
7. Create a migration guide for existing users

## Conclusion

This migration plan provides a comprehensive approach to migrating the MCP Framework to use the official MCP SDK directly, without custom implementations or adapters. By following this plan, we can create a more efficient and maintainable codebase that fully leverages the capabilities of the MCP SDK.
