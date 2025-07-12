import { z } from 'zod';

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
 * 
 * Tools must extend this class and implement the required properties and methods.
 * 
 * @example
 * ```typescript
 * import { MCPTool } from 'mcp-framework/codegen';
 * import { z } from 'zod';
 * 
 * export class GreetingTool extends MCPTool {
 *   readonly name = 'greeting';
 *   readonly description = 'Greets a user by name';
 *   readonly schema = z.object({
 *     name: z.string().describe('User name to greet'),
 *   });
 * 
 *   async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
 *     return this.textResponse(`Hello, ${input.name}!`);
 *   }
 * }
 * ```
 */
export abstract class MCPTool {
  /** 
   * Unique name for the tool (kebab-case recommended)
   */
  abstract readonly name: string;
  
  /**
   * Human-readable description of what the tool does
   */
  abstract readonly description: string;
  
  /**
   * Zod schema defining the input parameters for the tool
   * All fields must have descriptions using .describe()
   */
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
  
  /**
   * Validate the tool definition
   * Checks that all required properties are present and correctly formatted
   * 
   * @throws Error if validation fails
   */
  validate(): void {
    // Validate name
    if (!this.name) {
      throw new Error('Tool name is required');
    }
    
    if (!/^[a-z0-9-]+$/.test(this.name)) {
      throw new Error(`Tool name "${this.name}" must be kebab-case (lowercase with hyphens)`);
    }
    
    // Validate description
    if (!this.description) {
      throw new Error('Tool description is required');
    }
    
    if (this.description.length < 10) {
      throw new Error('Tool description must be at least 10 characters');
    }
    
    // Validate schema
    if (!this.schema) {
      throw new Error('Tool schema is required');
    }
    
    // Validate schema descriptions if it's a Zod object
    if (this.schema instanceof z.ZodObject) {
      const shape = (this.schema as any)._def.shape();
      const missingDescriptions: string[] = [];
      
      Object.entries(shape).forEach(([key, field]: [string, any]) => {
        let currentField = field;
        let hasDescription = false;
        
        // Unwrap optional, nullable, etc. to check for description
        while (currentField) {
          if (currentField._def?.description) {
            hasDescription = true;
            break;
          }
          
          // Try to unwrap
          if (
            currentField instanceof z.ZodOptional ||
            currentField instanceof z.ZodDefault ||
            currentField instanceof z.ZodNullable
          ) {
            currentField = currentField.unwrap ? currentField.unwrap() : currentField._def?.innerType;
          } else {
            break;
          }
        }
        
        if (!hasDescription) {
          missingDescriptions.push(key);
        }
      });
      
      if (missingDescriptions.length > 0) {
        throw new Error(
          `Schema fields missing descriptions: ${missingDescriptions.join(', ')}. ` +
          `Use .describe() on each field, e.g., z.string().describe("Field description")`
        );
      }
    }
  }
}

/**
 * Type helper to infer the input type from a tool's schema
 * 
 * @example
 * ```typescript
 * type GreetingInput = ToolInput<GreetingTool>;
 * ```
 */
export type ToolInput<T extends MCPTool> = z.infer<T['schema']>;
