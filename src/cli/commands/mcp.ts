import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { findUp } from 'find-up';
import prompts from 'prompts';
import { BuildPipeline, BuildConfig } from '../../codegen/BuildPipeline.js';
import { ServerMode } from '../../codegen/ServerGenerator.js';
import { watch, WatchOptions } from '../../codegen/WatchService.js';
import { discoverTools } from '../../codegen/ToolDiscovery.js';
import { ToolValidator, ValidationSeverity } from '../../codegen/ToolValidator.js';

/**
 * MCP configuration file name
 */
const CONFIG_FILENAME = 'mcp.config.json';

/**
 * Default MCP configuration
 */
const DEFAULT_CONFIG: BuildConfig = {
  projectRoot: process.cwd(),
  toolsDir: '.idea/mcp/ts/tools',
  outputDir: '.idea/mcp/generated',
  mode: ServerMode.SIMPLE,
  serverName: 'webstorm-mcp-server',
  serverVersion: '1.0.0',
  transport: 'stdio'
};

/**
 * Creates the MCP command suite
 * 
 * @returns Commander command object
 */
export function createMCPCommand(): Command {
  const mcpCommand = new Command('mcp')
    .description('WebStorm MCP integration tools')
    .version('1.0.0');
  
  // Project Management Commands
  mcpCommand
    .command('init-project')
    .description('Initialize MCP project structure with example tools')
    .option('--http', 'use HTTP transport instead of default stdio')
    .option('--port <number>', 'specify HTTP port (only valid with --http)', (val) => parseInt(val, 10))
    .option('--sdk', 'use official MCP SDK implementation')
    .option('--no-example', 'skip creating example tools')
    .action(initProject);
  
  mcpCommand
    .command('create-tool <name>')
    .description('Create a new MCP tool')
    .option('-t, --type <type>', 'tool type (analysis, action, utility)', 'utility')
    .option('-d, --description <description>', 'tool description')
    .action(createTool);
  
  // Build Commands
  mcpCommand
    .command('build')
    .description('Build MCP server from TypeScript tools')
    .option('-c, --config <path>', 'path to config file')
    .option('-m, --mode <mode>', 'server mode (simple or sdk)', 'simple')
    .option('-t, --transport <transport>', 'transport type (stdio or http)', 'stdio')
    .option('-p, --port <port>', 'HTTP port (only valid with --http)', (val) => parseInt(val, 10))
    .option('--skip-validation', 'skip tool validation')
    .option('--skip-deps', 'skip dependency installation')
    .option('--skip-compile', 'skip compilation')
    .action(buildServer);
  
  mcpCommand
    .command('watch')
    .description('Watch for changes and rebuild automatically')
    .option('-c, --config <path>', 'path to config file')
    .option('-m, --mode <mode>', 'server mode (simple or sdk)', 'simple')
    .option('-t, --transport <transport>', 'transport type (stdio or http)', 'stdio')
    .option('-p, --port <port>', 'HTTP port (only valid with --http)', (val) => parseInt(val, 10))
    .option('-d, --debounce <ms>', 'debounce time in milliseconds', (val) => parseInt(val, 10), 1000)
    .action(watchServer);
  
  mcpCommand
    .command('validate')
    .description('Validate tools without building')
    .option('-c, --config <path>', 'path to config file')
    .option('--fix', 'attempt to fix common issues')
    .action(validateTools);
  
  // SDK Migration Commands
  mcpCommand
    .command('migrate-to-sdk')
    .description('Migrate from simple to official SDK implementation')
    .option('-c, --config <path>', 'path to config file')
    .option('--backup', 'create backup before migration')
    .action(migrateToSDK);
  
  mcpCommand
    .command('check-sdk-compatibility')
    .description('Analyze tools for SDK compatibility')
    .option('-c, --config <path>', 'path to config file')
    .action(checkSDKCompatibility);
  
  return mcpCommand;
}

/**
 * Loads MCP configuration
 * 
 * @param configPath Optional path to config file
 * @returns Build configuration
 */
async function loadConfig(configPath?: string): Promise<BuildConfig> {
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

/**
 * Initializes a new MCP project
 * 
 * @param options Command options
 */
async function initProject(options: {
  http?: boolean;
  port?: number;
  sdk?: boolean;
  example?: boolean;
}): Promise<void> {
  try {
    console.log('🚀 Initializing MCP project...');
    
    // Determine project root
    const projectRoot = process.cwd();
    
    // Create config
    const config: BuildConfig = {
      ...DEFAULT_CONFIG,
      projectRoot,
      mode: options.sdk ? ServerMode.SDK : ServerMode.SIMPLE,
      transport: options.http ? 'http' : 'stdio',
      port: options.http ? (options.port || 3000) : undefined
    };
    
    // Create directory structure
    const toolsDir = path.join(projectRoot, config.toolsDir);
    const outputDir = path.join(projectRoot, config.outputDir);
    
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
      console.log(`✅ Created tools directory: ${config.toolsDir}`);
    }
    
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
      console.log(`✅ Created output directory: ${config.outputDir}`);
    }
    
    // Create config file
    const configPath = path.join(projectRoot, CONFIG_FILENAME);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✅ Created config file: ${CONFIG_FILENAME}`);
    
    // Create example tools if requested
    if (options.example) {
      await createExampleTools(toolsDir);
      console.log('✅ Created example tools');
    }
    
    console.log('\n🎉 MCP project initialized successfully!');
    console.log('\nNext steps:');
    console.log(`1. Create tools in ${config.toolsDir}`);
    console.log('2. Run `mcp build` to build the server');
    console.log('3. Run `mcp watch` to watch for changes');
  } catch (error) {
    console.error(`❌ Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Creates example tools
 * 
 * @param toolsDir Tools directory
 */
async function createExampleTools(toolsDir: string): Promise<void> {
  // Create example utility tool
  const utilityToolPath = path.join(toolsDir, 'GreetingTool.ts');
  const utilityToolContent = `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';

/**
 * A simple greeting tool that demonstrates the basic structure of an MCP tool
 */
export class GreetingTool extends MCPTool {
  readonly name = 'greeting';
  readonly description = 'Greets a user by name';
  
  readonly schema = z.object({
    name: z.string().describe('User name to greet'),
    formal: z.boolean().optional().describe('Whether to use formal greeting')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      const { name, formal } = input;
      
      const greeting = formal ? 'Hello' : 'Hi';
      return this.textResponse(\`\${greeting}, \${name}! Welcome to MCP tools.\`);
    } catch (error) {
      return this.errorResponse(\`Failed to generate greeting: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }
}
`;
  
  // Create example analysis tool
  const analysisToolPath = path.join(toolsDir, 'ProjectInfoTool.ts');
  const analysisToolContent = `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * An analysis tool that provides information about the project
 */
export class ProjectInfoTool extends MCPTool {
  readonly name = 'project-info';
  readonly description = 'Provides information about the project';
  
  readonly schema = z.object({
    includeFiles: z.boolean().optional().describe('Whether to include file list')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      if (!context?.projectRoot) {
        return this.errorResponse('Project root not available in context');
      }
      
      const projectRoot = context.projectRoot;
      const { includeFiles } = input;
      
      // Get package.json if available
      let packageInfo: any = null;
      try {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf8');
        packageInfo = JSON.parse(packageJsonContent);
      } catch (error) {
        // Package.json not found or invalid
      }
      
      // Get git info if available
      const gitInfo = context.git || {};
      
      // Get file list if requested
      let files: string[] = [];
      if (includeFiles) {
        files = await this.listFiles(projectRoot);
      }
      
      return this.jsonResponse({
        projectRoot,
        packageInfo: packageInfo ? {
          name: packageInfo.name,
          version: packageInfo.version,
          description: packageInfo.description
        } : null,
        gitInfo,
        files: includeFiles ? files : undefined
      });
    } catch (error) {
      return this.errorResponse(\`Failed to get project info: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }
  
  /**
   * Lists files in a directory recursively
   * 
   * @param dir Directory to list
   * @param baseDir Base directory for relative paths
   * @returns Array of file paths
   */
  private async listFiles(dir: string, baseDir: string = dir): Promise<string[]> {
    const files: string[] = [];
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules and .git directories
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }
        
        const subFiles = await this.listFiles(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        files.push(path.relative(baseDir, fullPath));
      }
    }
    
    return files;
  }
}
`;
  
  await fs.writeFile(utilityToolPath, utilityToolContent, 'utf8');
  await fs.writeFile(analysisToolPath, analysisToolContent, 'utf8');
}

/**
 * Creates a new MCP tool
 * 
 * @param name Tool name
 * @param options Command options
 */
async function createTool(name: string, options: {
  type?: string;
  description?: string;
}): Promise<void> {
  try {
    console.log(`🔧 Creating new tool: ${name}`);
    
    // Load config
    const config = await loadConfig();
    
    // Validate tool name (kebab-case)
    if (!/^[a-z0-9-]+$/.test(name)) {
      throw new Error('Tool name must be kebab-case (lowercase with hyphens)');
    }
    
    // Convert kebab-case to PascalCase for class name
    const className = name
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Tool';
    
    // Get tool description
    let description = options.description;
    if (!description) {
      const response = await prompts({
        type: 'text',
        name: 'description',
        message: 'Enter tool description:',
        validate: value => value.length >= 10 ? true : 'Description must be at least 10 characters'
      });
      
      description = response.description;
      
      // User cancelled
      if (!description) {
        console.log('❌ Tool creation cancelled');
        return;
      }
    }
    
    // Determine tool type and template
    const type = options.type || 'utility';
    let template = '';
    
    switch (type) {
      case 'analysis':
        template = createAnalysisToolTemplate(name, className, description);
        break;
      case 'action':
        template = createActionToolTemplate(name, className, description);
        break;
      case 'utility':
      default:
        template = createUtilityToolTemplate(name, className, description);
        break;
    }
    
    // Create tools directory if it doesn't exist
    const toolsDir = path.join(config.projectRoot, config.toolsDir);
    if (!existsSync(toolsDir)) {
      mkdirSync(toolsDir, { recursive: true });
    }
    
    // Write tool file
    const toolPath = path.join(toolsDir, `${className}.ts`);
    await fs.writeFile(toolPath, template, 'utf8');
    
    console.log(`✅ Created tool: ${toolPath}`);
    console.log('\nNext steps:');
    console.log('1. Edit the tool to implement your functionality');
    console.log('2. Run `mcp build` to build the server');
    console.log('3. Run `mcp watch` to watch for changes');
  } catch (error) {
    console.error(`❌ Failed to create tool: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Creates a utility tool template
 * 
 * @param name Tool name
 * @param className Class name
 * @param description Tool description
 * @returns Tool template
 */
function createUtilityToolTemplate(name: string, className: string, description: string): string {
  return `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';

/**
 * ${description}
 */
export class ${className} extends MCPTool {
  readonly name = '${name}';
  readonly description = '${description}';
  
  readonly schema = z.object({
    input: z.string().describe('Input to process'),
    option: z.boolean().optional().describe('Optional parameter')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      // Implement your tool logic here
      const result = \`Processed: \${input.input}\`;
      
      return this.textResponse(result);
    } catch (error) {
      return this.errorResponse(\`Failed to process input: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }
}
`;
}

/**
 * Creates an analysis tool template
 * 
 * @param name Tool name
 * @param className Class name
 * @param description Tool description
 * @returns Tool template
 */
function createAnalysisToolTemplate(name: string, className: string, description: string): string {
  return `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * ${description}
 */
export class ${className} extends MCPTool {
  readonly name = '${name}';
  readonly description = '${description}';
  
  readonly schema = z.object({
    path: z.string().optional().describe('Path to analyze (relative to project root)'),
    depth: z.number().int().positive().optional().describe('Analysis depth')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      if (!context?.projectRoot) {
        return this.errorResponse('Project root not available in context');
      }
      
      const projectRoot = context.projectRoot;
      const targetPath = input.path 
        ? path.resolve(projectRoot, input.path)
        : projectRoot;
      
      // Implement your analysis logic here
      const analysisResult = {
        path: targetPath,
        // Add your analysis data here
      };
      
      return this.jsonResponse(analysisResult);
    } catch (error) {
      return this.errorResponse(\`Analysis failed: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }
}
`;
}

/**
 * Creates an action tool template
 * 
 * @param name Tool name
 * @param className Class name
 * @param description Tool description
 * @returns Tool template
 */
function createActionToolTemplate(name: string, className: string, description: string): string {
  return `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * ${description}
 */
export class ${className} extends MCPTool {
  readonly name = '${name}';
  readonly description = '${description}';
  
  readonly schema = z.object({
    target: z.string().describe('Target to act upon'),
    action: z.enum(['create', 'update', 'delete']).describe('Action to perform'),
    data: z.string().optional().describe('Data for the action')
  });
  
  async execute(input: z.infer<typeof this.schema>, context?: ToolContext): Promise<ToolResult> {
    try {
      if (!context?.projectRoot) {
        return this.errorResponse('Project root not available in context');
      }
      
      const { target, action, data } = input;
      
      // Implement your action logic here
      let result: string;
      
      switch (action) {
        case 'create':
          result = \`Created \${target}\`;
          break;
        case 'update':
          result = \`Updated \${target}\`;
          break;
        case 'delete':
          result = \`Deleted \${target}\`;
          break;
        default:
          return this.errorResponse(\`Unknown action: \${action}\`);
      }
      
      return this.textResponse(result);
    } catch (error) {
      return this.errorResponse(\`Action failed: \${error instanceof Error ? error.message : String(error)}\`);
    }
  }
}
`;
}

/**
 * Builds the MCP server
 * 
 * @param options Command options
 */
async function buildServer(options: {
  config?: string;
  mode?: string;
  transport?: string;
  port?: number;
  skipValidation?: boolean;
  skipDeps?: boolean;
  skipCompile?: boolean;
}): Promise<void> {
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Override config with command line options
    if (options.mode) {
      config.mode = options.mode === 'sdk' ? ServerMode.SDK : ServerMode.SIMPLE;
    }
    
    if (options.transport) {
      config.transport = options.transport === 'http' ? 'http' : 'stdio';
    }
    
    if (options.port && config.transport === 'http') {
      config.port = options.port;
    }
    
    if (options.skipValidation) {
      config.skipValidation = true;
    }
    
    if (options.skipDeps) {
      config.skipDependencyInstall = true;
    }
    
    if (options.skipCompile) {
      config.skipCompilation = true;
    }
    
    // Build server
    console.log('🔨 Building MCP server...');
    const buildPipeline = new BuildPipeline(config);
    const result = await buildPipeline.build();
    
    if (result.success) {
      console.log('✅ Build completed successfully!');
    } else {
      console.error('❌ Build failed');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Watches for changes and rebuilds the server
 * 
 * @param options Command options
 */
async function watchServer(options: {
  config?: string;
  mode?: string;
  transport?: string;
  port?: number;
  debounce?: number;
}): Promise<void> {
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Override config with command line options
    if (options.mode) {
      config.mode = options.mode === 'sdk' ? ServerMode.SDK : ServerMode.SIMPLE;
    }
    
    if (options.transport) {
      config.transport = options.transport === 'http' ? 'http' : 'stdio';
    }
    
    if (options.port && config.transport === 'http') {
      config.port = options.port;
    }
    
    // Create watch options
    const watchOptions: WatchOptions = {
      ...config,
      debounceTime: options.debounce || 1000,
      // Skip dependency installation and compilation for faster rebuilds
      skipDependencyInstall: true,
      skipCompilation: false
    };
    
    // Start watching
    await watch(watchOptions);
  } catch (error) {
    console.error(`❌ Watch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Validates tools without building
 * 
 * @param options Command options
 */
async function validateTools(options: {
  config?: string;
  fix?: boolean;
}): Promise<void> {
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Discover tools
    console.log('🔍 Discovering tools...');
    const discoveryResult = await discoverTools({
      projectRoot: config.projectRoot,
      toolsDir: config.toolsDir
    });
    
    if (discoveryResult.errors.length > 0) {
      console.error('❌ Tool discovery failed:');
      discoveryResult.errors.forEach(error => console.error(`  - ${error}`));
    }
    
    if (discoveryResult.tools.length === 0) {
      console.warn('⚠️ No tools found in directory:', config.toolsDir);
      return;
    }
    
    console.log(`✅ Found ${discoveryResult.tools.length} tools`);
    
    // Validate tools
    console.log('🔍 Validating tools...');
    const validator = new ToolValidator();
    const validationResults = await validator.validateTools(discoveryResult.tools);
    
    // Count issues by severity
    const errorCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.ERROR).length, 0);
    
    const warningCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.WARNING).length, 0);
    
    const infoCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.INFO).length, 0);
    
    // Display validation results
    if (errorCount > 0 || warningCount > 0 || infoCount > 0) {
      console.log(`\nValidation results: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`);
      
      for (const result of validationResults) {
        if (result.issues.length > 0) {
          console.log(`\nTool: ${result.tool.className} (${result.tool.filePath})`);
          
          // Group issues by severity
          const errors = result.issues.filter(i => i.severity === ValidationSeverity.ERROR);
          const warnings = result.issues.filter(i => i.severity === ValidationSeverity.WARNING);
          const infos = result.issues.filter(i => i.severity === ValidationSeverity.INFO);
          
          if (errors.length > 0) {
            console.log('  Errors:');
            for (const issue of errors) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
          
          if (warnings.length > 0) {
            console.log('  Warnings:');
            for (const issue of warnings) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
          
          if (infos.length > 0) {
            console.log('  Info:');
            for (const issue of infos) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
        }
      }
      
      if (errorCount > 0) {
        console.error('\n❌ Validation failed with errors');
        process.exit(1);
      } else {
        console.log('\n✅ Validation completed with warnings/info');
      }
    } else {
      console.log('✅ All tools validated successfully');
    }
  } catch (error) {
    console.error(`❌ Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Migrates from simple to official SDK implementation
 * 
 * @param options Command options
 */
async function migrateToSDK(options: {
  config?: string;
  backup?: boolean;
}): Promise<void> {
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Check if already using SDK
    if (config.mode === ServerMode.SDK) {
      console.log('✅ Already using SDK implementation');
      return;
    }
    
    console.log('🔄 Migrating to official MCP SDK implementation...');
    
    // Create backup if requested
    if (options.backup) {
      const outputDir = path.join(config.projectRoot, config.outputDir);
      const backupDir = path.join(config.projectRoot, `${config.outputDir}-backup-${Date.now()}`);
      
      if (existsSync(outputDir)) {
        console.log(`📦 Creating backup: ${backupDir}`);
        
        // Copy output directory to backup
        await fs.mkdir(backupDir, { recursive: true });
        await copyDirectory(outputDir, backupDir);
      }
    }
    
    // Update config
    config.mode = ServerMode.SDK;
    
    // Save config
    const configPath = path.join(config.projectRoot, CONFIG_FILENAME);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    
    console.log('✅ Updated configuration to use SDK implementation');
    
    // Rebuild server
    console.log('🔨 Rebuilding server with SDK implementation...');
    const buildPipeline = new BuildPipeline(config);
    const result = await buildPipeline.build();
    
    if (result.success) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.error('❌ Migration failed during build');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Copies a directory recursively
 * 
 * @param source Source directory
 * @param destination Destination directory
 */
async function copyDirectory(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    
    if (entry.isDirectory()) {
      await fs.mkdir(destinationPath, { recursive: true });
      await copyDirectory(sourcePath, destinationPath);
    } else {
      await fs.copyFile(sourcePath, destinationPath);
    }
  }
}

/**
 * Checks tools for SDK compatibility
 * 
 * @param options Command options
 */
async function checkSDKCompatibility(options: {
  config?: string;
}): Promise<void> {
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Discover tools
    console.log('🔍 Discovering tools...');
    const discoveryResult = await discoverTools({
      projectRoot: config.projectRoot,
      toolsDir: config.toolsDir
    });
    
    if (discoveryResult.errors.length > 0) {
      console.error('❌ Tool discovery failed:');
      discoveryResult.errors.forEach(error => console.error(`  - ${error}`));
    }
    
    if (discoveryResult.tools.length === 0) {
      console.warn('⚠️ No tools found in directory:', config.toolsDir);
      return;
    }
    
    console.log(`✅ Found ${discoveryResult.tools.length} tools`);
    
    // Check SDK compatibility
    console.log('🔍 Checking SDK compatibility...');
    
    let allCompatible = true;
    
    for (const tool of discoveryResult.tools) {
      console.log(`\nTool: ${tool.className} (${tool.filePath})`);
      
      // Read tool file
      const content = await fs.readFile(tool.absolutePath, 'utf8');
      
      // Check for SDK compatibility issues
      const issues: string[] = [];
      
      // Check for custom response types
      if (content.includes('this.jsonResponse(') || content.includes('this.textResponse(') || content.includes('this.errorResponse(')) {
        issues.push('Uses custom response methods (jsonResponse, textResponse, errorResponse)');
      }
      
      // Check for direct access to context properties
      if (content.includes('context.projectRoot') || content.includes('context.workspaceFiles') || content.includes('context.git')) {
        issues.push('Directly accesses context properties');
      }
      
      if (issues.length > 0) {
        console.log('  ⚠️ SDK Compatibility Issues:');
        issues.forEach(issue => console.log(`    - ${issue}`));
        allCompatible = false;
      } else {
        console.log('  ✅ SDK Compatible');
      }
    }
    
    if (allCompatible) {
      console.log('\n✅ All tools are SDK compatible');
    } else {
      console.log('\n⚠️ Some tools have SDK compatibility issues');
      console.log('Run `mcp migrate-to-sdk` to migrate to the official SDK implementation');
    }
  } catch (error) {
    console.error(`❌ SDK compatibility check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Export the command
export default createMCPCommand();
