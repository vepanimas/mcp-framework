import { Tool } from '@modelcontextprotocol/sdk';
import { BaseLoader } from './BaseLoader.js';
import { logger } from '../core/Logger.js';
import { SDKTool } from '../tools/SDKTool.js';

/**
 * Loader for SDK-compatible tools
 */
export class SDKToolLoader extends BaseLoader<Tool> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'tools',
        excludedFiles: ['BaseTool.js', 'SDKTool.js', '*.test.js', '*.spec.js'],
        extensions: ['.js'],
      },
      basePath
    );
  }

  /**
   * Checks if any tools are available
   *
   * @returns Promise resolving to true if tools are available
   */
  async hasTools(): Promise<boolean> {
    return this.hasItems();
  }

  /**
   * Validates that an item is a valid Tool
   *
   * @param tool Tool to validate
   * @returns True if the tool is valid
   */
  protected validateItem(tool: any): tool is Tool {
    const isValid = Boolean(
      tool &&
        typeof tool.name === 'string' &&
        typeof tool.description === 'string' &&
        tool.inputSchema &&
        typeof tool.call === 'function'
    );

    if (isValid) {
      logger.debug(`Validated tool: ${tool.name}`);
    } else {
      logger.warn(`Invalid tool found: missing required properties`);
    }

    return isValid;
  }

  /**
   * Creates an instance of a tool class
   *
   * @param ToolClass Tool class constructor
   * @returns Tool instance
   */
  protected createInstance(ToolClass: any): Tool {
    const instance = new ToolClass();

    // If it's an SDKTool, validate it
    if (instance instanceof SDKTool) {
      try {
        // Validate the schema by accessing inputSchema
        const _ = instance.inputSchema;
      } catch (error) {
        logger.error(
          `Tool validation failed for ${ToolClass.name}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    }

    return instance;
  }

  /**
   * Gets the name of a tool
   *
   * @param tool Tool instance
   * @returns Tool name
   */
  protected getItemName(tool: Tool): string {
    return tool.name;
  }

  /**
   * Loads all tools
   *
   * @returns Promise resolving to an array of tools
   */
  async loadTools(): Promise<Tool[]> {
    return this.loadItems();
  }
}
