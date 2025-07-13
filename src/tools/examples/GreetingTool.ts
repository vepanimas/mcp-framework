import { z } from 'zod';
import { SDKTool, ToolInput } from '../SDKTool.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk';

/**
 * A simple greeting tool that demonstrates the usage of SDKTool
 */
export class GreetingTool extends SDKTool {
  readonly name = 'greeting';
  readonly description = 'Greets a user by name';

  readonly schema = z.object({
    name: z.string().describe('User name to greet'),
    formal: z.boolean().optional().describe('Whether to use formal greeting'),
    language: z.enum(['en', 'es', 'fr', 'de']).optional().describe('Language for the greeting'),
  });

  /**
   * Execute the greeting tool
   *
   * @param input Validated input
   * @returns Greeting message
   */
  protected async execute(input: ToolInput<GreetingTool>): Promise<string> {
    try {
      const { name, formal = false, language = 'en' } = input;

      // Validate name
      if (!name.trim()) {
        throw new McpError(ErrorCode.InvalidParams, 'Name cannot be empty', { field: 'name' });
      }

      // Generate greeting based on language and formality
      let greeting: string;

      switch (language) {
        case 'en':
          greeting = formal ? `Hello, ${name}!` : `Hi, ${name}!`;
          break;
        case 'es':
          greeting = formal ? `Hola, ${name}!` : `¡Hola, ${name}!`;
          break;
        case 'fr':
          greeting = formal ? `Bonjour, ${name}!` : `Salut, ${name}!`;
          break;
        case 'de':
          greeting = formal ? `Guten Tag, ${name}!` : `Hallo, ${name}!`;
          break;
        default:
          // This should never happen due to enum validation, but TypeScript doesn't know that
          throw new McpError(ErrorCode.InvalidParams, `Unsupported language: ${language}`, {
            field: 'language',
          });
      }

      return greeting;
    } catch (error) {
      // If it's already an McpError, rethrow it
      if (error instanceof McpError) {
        throw error;
      }

      // Otherwise, wrap it in an McpError
      throw new McpError(
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
