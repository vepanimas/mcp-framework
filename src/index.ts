export { MCPServer } from './core/ModernMCPServer.js';
export { z } from 'zod';

// Re-export useful SDK types for convenience
export type { 
  JSONRPCMessage,
  Tool,
  Resource,
  Prompt,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/types.js';

// Export transport types
export type {
  TransportType,
  MCPServerConfig,
  ToolHandler,
  PromptHandler,
  ResourceHandler
} from './core/ModernMCPServer.js';

// Export codegen functionality
export { BuildPipeline } from './codegen/BuildPipeline.js';
export { ToolDiscovery } from './codegen/ToolDiscovery.js';
export { ToolValidator } from './codegen/ToolValidator.js';
export { ServerGenerator } from './codegen/ServerGenerator.js';
export { WatchService } from './codegen/WatchService.js';

export type {
  BuildResult
} from './codegen/BuildPipeline.js';

export type {
  GenerationConfig
} from './codegen/ServerGenerator.js';

export type {
  DiscoveredTool
} from './codegen/ToolDiscovery.js';

export type {
  ValidationResult
} from './codegen/ToolValidator.js';

export type {
  WatchConfig
} from './codegen/WatchService.js';