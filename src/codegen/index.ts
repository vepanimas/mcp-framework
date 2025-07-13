/**
 * MCP Framework - WebStorm Integration
 *
 * This module provides a comprehensive TypeScript-to-MCP-Server build system
 * for WebStorm IDE integration.
 */

// Tool Definition System
export {
  MCPTool,
  ToolContext,
  ToolResult,
  TextResponse,
  JsonResponse,
  ErrorResponse,
  ToolInput,
} from './ToolDefinition.js';

// TypeScript Discovery Engine
export {
  discoverTools,
  ToolDiscovery,
  ToolInfo,
  DiscoveryOptions,
  DiscoveryResult,
} from './ToolDiscovery.js';

// Validation Framework
export {
  ToolValidator,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  ValidationOptions,
} from './ToolValidator.js';

// Server Generator
export { ServerGenerator, ServerGeneratorOptions, GenerationResult } from './ServerGenerator.js';

// Build Pipeline
export { BuildPipeline, BuildConfig, BuildResult } from './BuildPipeline.js';

// Watch Service
export { WatchService, watch, WatchOptions } from './WatchService.js';

// Configuration Schema
export {
  mcpConfigSchema,
  MCPConfig,
  DEFAULT_CONFIG,
  PROJECT_STRUCTURE,
  validateConfig,
  createDefaultConfig,
  generateWebStormInstructions,
  generateReadme,
} from './ConfigSchema.js';

// Import types for use in this file
import { MCPConfig } from './ConfigSchema.js';
import { BuildConfig, BuildResult } from './BuildPipeline.js';
import { WatchOptions } from './WatchService.js';
import { ValidationResult } from './ToolValidator.js';

/**
 * Initialize a new WebStorm MCP project
 *
 * This is a convenience function that creates a new WebStorm MCP project
 * with the specified configuration.
 *
 * @param config Project configuration
 * @returns Promise resolving when initialization is complete
 */
export async function initProject(config: Partial<MCPConfig> = {}): Promise<void> {
  const { createDefaultConfig, PROJECT_STRUCTURE } = await import('./ConfigSchema.js');
  const fs = await import('fs/promises');
  const path = await import('path');
  const { existsSync, mkdirSync } = await import('fs');

  // Create configuration
  const fullConfig = createDefaultConfig(config);

  // Create directory structure
  const toolsDir = path.join(fullConfig.projectRoot, fullConfig.toolsDir);
  const outputDir = path.join(fullConfig.projectRoot, fullConfig.outputDir);

  if (!existsSync(toolsDir)) {
    mkdirSync(toolsDir, { recursive: true });
    console.log(`✅ Created tools directory: ${fullConfig.toolsDir}`);
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Created output directory: ${fullConfig.outputDir}`);
  }

  // Create config file
  const configPath = path.join(fullConfig.projectRoot, PROJECT_STRUCTURE.config.filename);
  await fs.writeFile(configPath, JSON.stringify(fullConfig, null, 2), 'utf8');
  console.log(`✅ Created config file: ${PROJECT_STRUCTURE.config.filename}`);

  // Create README
  const { generateReadme } = await import('./ConfigSchema.js');
  const readmePath = path.join(fullConfig.projectRoot, 'README.md');
  await fs.writeFile(readmePath, generateReadme(fullConfig), 'utf8');
  console.log(`✅ Created README.md`);

  console.log('🎉 WebStorm MCP project initialized successfully!');
}

/**
 * Build an MCP server from TypeScript tools
 *
 * This is a convenience function that builds an MCP server from TypeScript tools
 * with the specified configuration.
 *
 * @param config Build configuration
 * @returns Promise resolving to the build result
 */
export async function build(config: Partial<BuildConfig> = {}): Promise<BuildResult> {
  const { BuildPipeline } = await import('./BuildPipeline.js');
  const { createDefaultConfig } = await import('./ConfigSchema.js');

  const fullConfig = createDefaultConfig(config) as BuildConfig;
  const buildPipeline = new BuildPipeline(fullConfig);

  return buildPipeline.build();
}

/**
 * Watch for changes and rebuild automatically
 *
 * This is a convenience function that watches for changes in TypeScript tools
 * and rebuilds the MCP server automatically.
 *
 * @param config Watch options
 * @returns Promise resolving to the watch service
 */
export async function watchAndBuild(config: Partial<WatchOptions> = {}): Promise<void> {
  const { watch } = await import('./WatchService.js');
  const { createDefaultConfig } = await import('./ConfigSchema.js');

  const fullConfig = createDefaultConfig(config) as WatchOptions;
  await watch(fullConfig);
}

/**
 * Validate TypeScript tools
 *
 * This is a convenience function that validates TypeScript tools
 * with the specified configuration.
 *
 * @param config Validation configuration
 * @returns Promise resolving to the validation results
 */
export async function validate(config: Partial<MCPConfig> = {}): Promise<ValidationResult[]> {
  const { discoverTools } = await import('./ToolDiscovery.js');
  const { ToolValidator } = await import('./ToolValidator.js');
  const { createDefaultConfig } = await import('./ConfigSchema.js');

  const fullConfig = createDefaultConfig(config);

  // Discover tools
  const discoveryResult = await discoverTools({
    projectRoot: fullConfig.projectRoot,
    toolsDir: fullConfig.toolsDir,
  });

  if (discoveryResult.tools.length === 0) {
    return [];
  }

  // Validate tools
  const validator = new ToolValidator();
  return validator.validateTools(discoveryResult.tools);
}

/**
 * Copy a directory recursively
 *
 * @param source Source directory
 * @param destination Destination directory
 */
async function copyDirectory(source: string, destination: string): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const { existsSync, mkdirSync } = await import('fs');

  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      if (!existsSync(destinationPath)) {
        mkdirSync(destinationPath, { recursive: true });
      }
      await copyDirectory(sourcePath, destinationPath);
    } else {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}
