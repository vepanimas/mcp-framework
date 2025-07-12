import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { findUp } from 'find-up';
import { BuildConfig } from '../../codegen/BuildPipeline.js';
import { ServerMode } from '../../codegen/ServerGenerator.js';

/**
 * MCP configuration file name
 */
export const CONFIG_FILENAME = 'mcp.config.json';

/**
 * Default MCP configuration
 */
export const DEFAULT_CONFIG: BuildConfig = {
  projectRoot: process.cwd(),
  toolsDir: '.idea/mcp/ts/tools',
  outputDir: '.idea/mcp/generated',
  mode: ServerMode.SIMPLE,
  serverName: 'webstorm-mcp-server',
  serverVersion: '1.0.0',
  transport: 'stdio'
};

/**
 * Loads MCP configuration
 * 
 * @param configPath Optional path to config file
 * @returns Promise resolving to the build configuration
 */
export async function loadConfig(configPath?: string): Promise<BuildConfig> {
  try {
    // If config path is provided, load from there
    if (configPath) {
      const absolutePath = path.resolve(process.cwd(), configPath);
      if (!existsSync(absolutePath)) {
        throw new Error(`Config file not found: ${absolutePath}`);
      }
      
      const configContent = await fs.readFile(absolutePath, 'utf8');
      const config = JSON.parse(configContent);
      
      return {
        ...DEFAULT_CONFIG,
        ...config,
        projectRoot: path.dirname(absolutePath)
      };
    }
    
    // Otherwise, search for config file in current directory and parent directories
    const configFilePath = await findUp(CONFIG_FILENAME);
    
    if (configFilePath) {
      const configContent = await fs.readFile(configFilePath, 'utf8');
      const config = JSON.parse(configContent);
      
      return {
        ...DEFAULT_CONFIG,
        ...config,
        projectRoot: path.dirname(configFilePath)
      };
    }
    
    // If no config file found, use default config
    return { ...DEFAULT_CONFIG };
  } catch (error) {
    console.error(`Error loading config: ${error instanceof Error ? error.message : String(error)}`);
    return { ...DEFAULT_CONFIG };
  }
}
