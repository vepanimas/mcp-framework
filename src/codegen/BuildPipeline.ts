import { ToolDiscovery } from './ToolDiscovery.js';
import { ToolValidator } from './ToolValidator.js';
import { ServerGenerator } from './ServerGenerator.js';
import type { GenerationConfig } from './ServerGenerator.js';
import { execa } from 'execa';
import { join } from 'path';

export interface BuildResult {
  success: boolean;
  serverPath?: string;
  compiledServerPath?: string;
  errors: string[];
  warnings: string[];
  toolsDiscovered: number;
  toolsValid: number;
  buildTime: number;
}

export interface CompilationResult {
  success: boolean;
  errors: string[];
  outputPath?: string;
}

export class BuildPipeline {
  private discovery: ToolDiscovery;
  private validator: ToolValidator;
  private generator: ServerGenerator;
  private compiler: TypeScriptCompiler;

  constructor(private config: GenerationConfig) {
    this.discovery = new ToolDiscovery(config.toolsDirectory, config.projectRoot);
    this.validator = new ToolValidator();
    this.generator = new ServerGenerator(config);
    this.compiler = new TypeScriptCompiler(config.outputDirectory);
  }

  async build(): Promise<BuildResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      console.log('🔍 Discovering TypeScript tools...');
      const tools = await this.discovery.discoverTools();
      
      if (tools.length === 0) {
        errors.push(`No TypeScript tools found in: ${this.config.toolsDirectory}`);
        return this.buildResult(false, startTime, errors, warnings, 0, 0);
      }

      console.log(`📋 Found ${tools.length} tool file(s), validating...`);
      const validation = await this.validator.validateTools(tools);
      
      // Add validation warnings
      warnings.push(...validation.warnings.map(w => `${w.file}: ${w.message}`));

      if (!validation.isValid) {
        errors.push(...validation.errors.map(e => `${e.file}: ${e.message}`));
        const validToolsCount = tools.filter(t => t.isValid).length;
        return this.buildResult(false, startTime, errors, warnings, tools.length, validToolsCount);
      }

      const validTools = tools.filter(t => t.isValid);
      console.log(`✅ Validated ${validTools.length} tool(s)`);

      console.log('🏗️  Generating MCP server code...');
      const serverPath = await this.generator.generateServer(validTools);

      console.log('🔧 Installing dependencies...');
      await this.installDependencies();

      console.log('🔧 Compiling TypeScript...');
      const compilationResult = await this.compiler.compile();
      
      if (!compilationResult.success) {
        errors.push(...compilationResult.errors);
        return this.buildResult(false, startTime, errors, warnings, tools.length, validTools.length, serverPath);
      }

      console.log('✅ MCP server build completed successfully!');
      return this.buildResult(
        true, 
        startTime, 
        errors, 
        warnings, 
        tools.length, 
        validTools.length, 
        serverPath, 
        compilationResult.outputPath
      );

    } catch (error) {
      errors.push(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
      return this.buildResult(false, startTime, errors, warnings, 0, 0);
    }
  }

  private async installDependencies(): Promise<void> {
    try {
      await execa('npm', ['install'], {
        cwd: this.config.outputDirectory,
        stdio: 'pipe' // Hide npm output unless there's an error
      });
    } catch (error) {
      // Try with --no-package-lock if regular install fails
      try {
        await execa('npm', ['install', '--no-package-lock'], {
          cwd: this.config.outputDirectory,
          stdio: 'pipe'
        });
      } catch (fallbackError) {
        throw new Error(`Failed to install dependencies: ${error}`);
      }
    }
  }

  private buildResult(
    success: boolean,
    startTime: number,
    errors: string[],
    warnings: string[],
    toolsDiscovered: number,
    toolsValid: number,
    serverPath?: string,
    compiledServerPath?: string
  ): BuildResult {
    return {
      success,
      serverPath,
      compiledServerPath,
      errors,
      warnings,
      toolsDiscovered,
      toolsValid,
      buildTime: Date.now() - startTime
    };
  }
}

// TypeScript Compiler for the generated server
export class TypeScriptCompiler {
  constructor(private projectRoot: string) {}

  async compile(): Promise<CompilationResult> {
    try {
      const configPath = join(this.projectRoot, 'tsconfig.json');
      
      const result = await execa('npx', ['tsc', '--project', configPath], {
        cwd: this.projectRoot,
        stdio: 'pipe',
        reject: false // Don't throw on non-zero exit code
      });

      if (result.exitCode !== 0) {
        const errors = [];
        if (result.stderr) errors.push(`TypeScript compilation stderr: ${result.stderr}`);
        if (result.stdout) errors.push(`TypeScript compilation stdout: ${result.stdout}`);
        
        return {
          success: false,
          errors: errors.length > 0 ? errors : ['TypeScript compilation failed with unknown error']
        };
      }

      const outputPath = join(this.projectRoot, 'dist', 'server.js');
      return { 
        success: true, 
        errors: [], 
        outputPath 
      };
    } catch (error) {
      return {
        success: false,
        errors: [`TypeScript compilation failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }
}