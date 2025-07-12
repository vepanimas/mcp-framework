import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { BuildPipeline, BuildResult } from '../../codegen/BuildPipeline.js';
import { WatchService } from '../../codegen/WatchService.js';
import { GenerationConfig } from '../../codegen/ServerGenerator.js';
import { ToolDiscovery } from '../../codegen/ToolDiscovery.js';
import { ToolValidator } from '../../codegen/ToolValidator.js';

export interface MCPProjectConfig {
  name: string;
  version: string;
  transport: 'stdio' | 'http';
  port?: number;
  toolsDirectory: string;
  outputDirectory: string;
}

export async function initMCPProject(options: {
  name?: string;
  transport: string;
  port: string;
}) {
  const projectRoot = process.cwd();
  const projectName = options.name || getProjectNameFromDirectory(projectRoot);
  
  console.log('🚀 Initializing MCP project...');
  
  // Create directory structure
  const toolsDir = join(projectRoot, '.idea/mcp/ts/tools');
  const outputDir = join(projectRoot, '.idea/mcp/generated');
  
  try {
    await mkdir(toolsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    
    console.log(`📁 Created tools directory: ${toolsDir}`);
    console.log(`📁 Created output directory: ${outputDir}`);
    
    // Create example tools
    await createExampleTools(toolsDir);
    
    // Create config file
    await createConfigFile(projectRoot, projectName, options);
    
    // Create gitignore entries
    await updateGitignore(projectRoot);
    
    console.log('✅ MCP project initialized!');
    console.log(`📝 Tools directory: ${toolsDir}`);
    console.log('🛠️  Example tools created - edit them to customize');
    console.log('🏗️  Run "mcp build" to build the server');
    console.log('👀 Run "mcp watch" for development mode');
    console.log('📄 Run "mcp create-tool <name>" to add new tools');
  } catch (error) {
    console.error('❌ Failed to initialize MCP project:', error);
    process.exit(1);
  }
}

export async function buildMCPServer(options: {
  toolsDir: string;
  outputDir: string;
}) {
  const projectRoot = process.cwd();
  
  try {
    const config = await loadConfig(projectRoot);
    
    const generationConfig: GenerationConfig = {
      projectRoot,
      toolsDirectory: join(projectRoot, options.toolsDir),
      outputDirectory: join(projectRoot, options.outputDir),
      serverName: config.name,
      serverVersion: config.version,
      transport: config.transport,
      port: config.port
    };
    
    console.log('🏗️  Building MCP server...');
    console.log(`📂 Tools directory: ${generationConfig.toolsDirectory}`);
    console.log(`📂 Output directory: ${generationConfig.outputDirectory}`);
    
    const pipeline = new BuildPipeline(generationConfig);
    const result = await pipeline.build();
    
    if (result.success) {
      console.log('🎉 MCP server built successfully!');
      console.log(`📄 Generated server: ${result.serverPath}`);
      if (result.compiledServerPath) {
        console.log(`🚀 Compiled server: ${result.compiledServerPath}`);
      }
      console.log(`📊 Tools: ${result.toolsValid}/${result.toolsDiscovered} valid`);
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(warning => console.log(`   - ${warning}`));
      }
      
      console.log('\n🔌 WebStorm Integration:');
      console.log(`   Add this to your claude_desktop_config.json:`);
      console.log(`   "${config.name}": {`);
      if (config.transport === 'stdio') {
        console.log(`     "command": "node",`);
        console.log(`     "args": ["${result.compiledServerPath}"]`);
      } else {
        console.log(`     "url": "http://localhost:${config.port || 8080}/mcp"`);
      }
      console.log(`   }`);
    } else {
      console.error('❌ Build failed:');
      result.errors.forEach(error => console.error(`   ${error}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

export async function watchMCPServer(options: {
  toolsDir: string;
  outputDir: string;
}) {
  const projectRoot = process.cwd();
  
  try {
    const config = await loadConfig(projectRoot);
    
    const generationConfig: GenerationConfig = {
      projectRoot,
      toolsDirectory: join(projectRoot, options.toolsDir),
      outputDirectory: join(projectRoot, options.outputDir),
      serverName: config.name,
      serverVersion: config.version,
      transport: config.transport,
      port: config.port
    };
    
    const watchService = new WatchService({
      toolsDirectory: generationConfig.toolsDirectory,
      generationConfig,
      onRebuild: (result) => {
        if (result.success && result.compiledServerPath) {
          console.log(`🔄 Server updated: ${result.compiledServerPath}`);
        }
      },
      onError: (error) => {
        console.error('👁️  Watch error:', error);
      }
    });
    
    await watchService.start();
    
    // Keep process alive and handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping watch service...');
      await watchService.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Stopping watch service...');
      await watchService.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Watch failed:', error);
    process.exit(1);
  }
}

export async function validateTools(options: {
  toolsDir: string;
}) {
  const projectRoot = process.cwd();
  const toolsDirectory = join(projectRoot, options.toolsDir);
  
  try {
    console.log('🔍 Validating TypeScript tools...');
    
    const discovery = new ToolDiscovery(toolsDirectory, projectRoot);
    const validator = new ToolValidator();
    
    const tools = await discovery.discoverTools();
    
    if (tools.length === 0) {
      console.log('📭 No tools found in the tools directory');
      return;
    }
    
    console.log(`📋 Found ${tools.length} tool file(s)`);
    
    const validation = await validator.validateTools(tools);
    
    // Show validation results
    const validTools = tools.filter(t => t.isValid);
    console.log(`✅ Valid tools: ${validTools.length}/${tools.length}`);
    
    if (validTools.length > 0) {
      console.log('\n📝 Valid tools:');
      validTools.forEach(tool => {
        console.log(`   ✅ ${tool.toolName} (${tool.className}) - ${tool.description}`);
      });
    }
    
    if (validation.errors.length > 0) {
      console.log('\n❌ Errors:');
      validation.errors.forEach(error => {
        console.log(`   - ${error.file}: ${error.message}`);
      });
    }
    
    if (validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      validation.warnings.forEach(warning => {
        console.log(`   - ${warning.file}: ${warning.message}`);
      });
    }
    
    if (!validation.isValid) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

export async function createToolTemplate(
  name: string,
  options: {
    type: 'analysis' | 'action' | 'utility';
    toolsDir: string;
  }
) {
  const projectRoot = process.cwd();
  const toolsDir = join(projectRoot, options.toolsDir);
  
  try {
    await mkdir(toolsDir, { recursive: true });
    
    const className = toPascalCase(name);
    const fileName = `${className}.ts`;
    const filePath = join(toolsDir, fileName);
    
    // Check if file already exists
    try {
      await access(filePath);
      console.error(`❌ Tool file already exists: ${fileName}`);
      process.exit(1);
    } catch {
      // File doesn't exist, which is what we want
    }
    
    const content = generateToolTemplate(name, className, options.type);
    await writeFile(filePath, content);
    
    console.log(`✅ Created ${options.type} tool: ${fileName}`);
    console.log(`📁 Location: ${filePath}`);
    console.log('📝 Edit the tool to implement your logic');
    console.log('🏗️  Run "mcp build" to include it in your server');
    
  } catch (error) {
    console.error('❌ Failed to create tool:', error);
    process.exit(1);
  }
}

// Helper functions

function getProjectNameFromDirectory(projectRoot: string): string {
  return projectRoot.split('/').pop() || 'my-mcp-tools';
}

async function createExampleTools(toolsDir: string): Promise<void> {
  const examples = [
    {
      name: 'project-analyzer',
      type: 'analysis' as const,
      description: 'Analyze project structure and provide insights'
    },
    {
      name: 'code-formatter',
      type: 'action' as const,
      description: 'Format code according to project standards'
    },
    {
      name: 'git-helper',
      type: 'utility' as const,
      description: 'Git repository utilities'
    }
  ];

  for (const example of examples) {
    const className = toPascalCase(example.name);
    const fileName = `${className}.ts`;
    const content = generateToolTemplate(example.name, className, example.type);
    await writeFile(join(toolsDir, fileName), content);
  }

  console.log(`📝 Created ${examples.length} example tools`);
}

async function createConfigFile(projectRoot: string, name: string, options: any): Promise<void> {
  const config: MCPProjectConfig = {
    name,
    version: '1.0.0',
    transport: options.transport as 'stdio' | 'http',
    port: options.transport === 'http' ? parseInt(options.port) : undefined,
    toolsDirectory: '.idea/mcp/ts/tools',
    outputDirectory: '.idea/mcp/generated'
  };
  
  const configDir = join(projectRoot, '.idea/mcp');
  await mkdir(configDir, { recursive: true });
  
  await writeFile(
    join(configDir, 'mcp.config.json'),
    JSON.stringify(config, null, 2)
  );
  
  console.log('⚙️  Created configuration file');
}

async function updateGitignore(projectRoot: string): Promise<void> {
  const gitignorePath = join(projectRoot, '.gitignore');
  const mcpIgnoreEntries = [
    '',
    '# MCP Framework generated files',
    '.idea/mcp/generated/',
    '.idea/mcp/dist/',
    ''
  ].join('\n');

  try {
    // Try to read existing .gitignore
    const existingContent = await readFile(gitignorePath, 'utf-8');
    
    // Check if MCP entries already exist
    if (existingContent.includes('.idea/mcp/generated/')) {
      return;
    }
    
    // Append MCP entries
    await writeFile(gitignorePath, existingContent + mcpIgnoreEntries);
  } catch {
    // .gitignore doesn't exist, create it
    await writeFile(gitignorePath, mcpIgnoreEntries);
  }
  
  console.log('📄 Updated .gitignore');
}

async function loadConfig(projectRoot: string): Promise<MCPProjectConfig> {
  const configPath = join(projectRoot, '.idea/mcp/mcp.config.json');
  
  try {
    const configContent = await readFile(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    throw new Error(`Could not load MCP config. Run "mcp init-project" first. (${configPath})`);
  }
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

function generateToolTemplate(toolName: string, className: string, toolType: 'analysis' | 'action' | 'utility'): string {
  const templates = {
    analysis: `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export default class ${className} extends MCPTool {
  readonly name = '${toolName}';
  readonly description = 'Analyze project structure and provide insights';
  readonly category = 'Analysis';

  readonly schema = z.object({
    path: z.string().describe('Path to analyze (relative to project root)'),
    includeHidden: z.boolean().default(false).describe('Include hidden files'),
    maxDepth: z.number().default(3).describe('Maximum directory depth')
  });

  readonly examples = [
    {
      description: 'Analyze the src directory',
      input: { path: 'src', includeHidden: false, maxDepth: 2 }
    }
  ];

  async execute(
    input: { path: string; includeHidden: boolean; maxDepth: number },
    context?: ToolContext
  ): Promise<ToolResult> {
    try {
      const fullPath = join(context?.projectRoot || process.cwd(), input.path);
      const analysis = await this.analyzeDirectory(fullPath, input.includeHidden, input.maxDepth);
      
      return this.jsonResponse({
        path: input.path,
        analysis,
        summary: \`Found \${analysis.files} files in \${analysis.directories} directories\`
      });
    } catch (error) {
      return this.errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async analyzeDirectory(path: string, includeHidden: boolean, maxDepth: number) {
    let files = 0;
    let directories = 0;
    const fileTypes = new Map<string, number>();
    
    const analyze = async (currentPath: string, depth: number) => {
      if (depth > maxDepth) return;
      
      try {
        const entries = await readdir(currentPath);
        for (const entry of entries) {
          if (!includeHidden && entry.startsWith('.')) continue;
          
          const entryPath = join(currentPath, entry);
          const stats = await stat(entryPath);
          
          if (stats.isDirectory()) {
            directories++;
            await analyze(entryPath, depth + 1);
          } else {
            files++;
            const ext = entry.split('.').pop() || 'no-extension';
            fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };
    
    await analyze(path, 0);
    
    return {
      files,
      directories,
      fileTypes: Object.fromEntries(fileTypes)
    };
  }
}`,

    action: `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export default class ${className} extends MCPTool {
  readonly name = '${toolName}';
  readonly description = 'Format code according to project standards';
  readonly category = 'Actions';

  readonly schema = z.object({
    filePath: z.string().describe('Path to the file to format'),
    formatType: z.enum(['prettier', 'eslint', 'basic']).default('basic').describe('Formatting type'),
    options: z.object({
      tabSize: z.number().default(2).describe('Tab size for indentation'),
      insertFinalNewline: z.boolean().default(true).describe('Insert final newline')
    }).optional().describe('Formatting options')
  });

  readonly examples = [
    {
      description: 'Format a TypeScript file',
      input: { filePath: 'src/example.ts', formatType: 'prettier' }
    }
  ];

  async execute(
    input: { filePath: string; formatType: 'prettier' | 'eslint' | 'basic'; options?: any },
    context?: ToolContext
  ): Promise<ToolResult> {
    try {
      const fullPath = join(context?.projectRoot || process.cwd(), input.filePath);
      
      // Read the file
      const content = await readFile(fullPath, 'utf-8');
      
      // Apply formatting based on type
      let formattedContent: string;
      switch (input.formatType) {
        case 'basic':
          formattedContent = this.basicFormat(content, input.options);
          break;
        case 'prettier':
        case 'eslint':
          // TODO: Integrate with actual prettier/eslint
          formattedContent = this.basicFormat(content, input.options);
          break;
        default:
          formattedContent = content;
      }
      
      // Write back to file
      await writeFile(fullPath, formattedContent);
      
      return this.textResponse(
        \`Successfully formatted \${input.filePath} using \${input.formatType} formatting\`
      );
    } catch (error) {
      return this.errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private basicFormat(content: string, options: any = {}): string {
    const tabSize = options?.tabSize || 2;
    const insertFinalNewline = options?.insertFinalNewline !== false;
    
    // Basic formatting: normalize whitespace, fix indentation
    let formatted = content
      .split('\\n')
      .map(line => line.trimEnd()) // Remove trailing whitespace
      .join('\\n');
    
    // Ensure final newline if requested
    if (insertFinalNewline && !formatted.endsWith('\\n')) {
      formatted += '\\n';
    }
    
    return formatted;
  }
}`,

    utility: `import { MCPTool, ToolContext, ToolResult } from 'mcp-framework/codegen';
import { z } from 'zod';
import { execSync } from 'child_process';

export default class ${className} extends MCPTool {
  readonly name = '${toolName}';
  readonly description = 'Git repository utilities and information';
  readonly category = 'Utilities';

  readonly schema = z.object({
    command: z.enum(['status', 'branch', 'log', 'diff']).describe('Git command to execute'),
    options: z.object({
      limit: z.number().default(10).describe('Limit for log entries'),
      staged: z.boolean().default(false).describe('Show staged changes only')
    }).optional().describe('Command options')
  });

  readonly examples = [
    {
      description: 'Get git status',
      input: { command: 'status' }
    },
    {
      description: 'Get recent commits',
      input: { command: 'log', options: { limit: 5 } }
    }
  ];

  async execute(
    input: { command: 'status' | 'branch' | 'log' | 'diff'; options?: any },
    context?: ToolContext
  ): Promise<ToolResult> {
    try {
      const projectRoot = context?.projectRoot || process.cwd();
      const options = input.options || {};
      
      let result: string;
      
      switch (input.command) {
        case 'status':
          result = this.executeGitCommand('git status --porcelain', projectRoot);
          break;
          
        case 'branch':
          result = this.executeGitCommand('git branch -v', projectRoot);
          break;
          
        case 'log':
          const limit = options.limit || 10;
          result = this.executeGitCommand(
            \`git log --oneline -\${limit}\`,
            projectRoot
          );
          break;
          
        case 'diff':
          const diffCmd = options.staged ? 'git diff --staged' : 'git diff';
          result = this.executeGitCommand(diffCmd, projectRoot);
          break;
          
        default:
          return this.errorResponse(\`Unknown git command: \${input.command}\`);
      }
      
      return this.textResponse(result || \`No output from git \${input.command}\`);
    } catch (error) {
      return this.errorResponse(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private executeGitCommand(command: string, cwd: string): string {
    try {
      return execSync(command, {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();
    } catch (error: any) {
      if (error.status === 128) {
        throw new Error('Not a git repository');
      }
      throw new Error(\`Git command failed: \${error.message}\`);
    }
  }
}`
  };

  return templates[toolType];
}