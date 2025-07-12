import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (input: any, context?: ToolContext) => Promise<ToolResult>;
  category?: string;
  examples?: ToolExample[];
}

export interface ToolContext {
  projectRoot: string;
  currentFile?: string;
  workspaceFiles: string[];
  gitInfo?: GitInfo;
}

export interface GitInfo {
  branch: string;
  hasUncommittedChanges: boolean;
  remoteUrl?: string;
}

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
}

export interface ToolExample {
  description: string;
  input: Record<string, any>;
  expectedOutput?: string;
}

/**
 * Base class for user-defined MCP tools
 * 
 * Example usage:
 * ```typescript
 * export default class MyTool extends MCPTool {
 *   readonly name = 'my-tool';
 *   readonly description = 'Does something useful';
 *   readonly schema = z.object({
 *     input: z.string().describe('What to process')
 *   });
 * 
 *   async execute(input: { input: string }, context?: ToolContext): Promise<ToolResult> {
 *     return this.textResponse(`Processed: ${input.input}`);
 *   }
 * }
 * ```
 */
export abstract class MCPTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: z.ZodType;
  
  category?: string = 'User Tools';
  examples?: ToolExample[] = [];

  abstract execute(input: any, context?: ToolContext): Promise<ToolResult>;

  // Helper methods for common response types
  protected textResponse(text: string): ToolResult {
    return { content: [{ type: 'text', text }] };
  }

  protected jsonResponse(data: any): ToolResult {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  protected errorResponse(error: string): ToolResult {
    return { content: [{ type: 'text', text: `Error: ${error}` }] };
  }

  protected imageResponse(data: string, mimeType: string = 'image/png'): ToolResult {
    return { content: [{ type: 'image', data, mimeType }] };
  }

  protected resourceResponse(uri: string): ToolResult {
    return { content: [{ type: 'resource', uri }] };
  }

  protected multiResponse(...contents: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: string; mimeType?: string; uri?: string }>): ToolResult {
    return { content: contents };
  }
}