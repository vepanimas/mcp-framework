import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { execa } from 'execa';
import { discoverTools, DiscoveryOptions, ToolInfo } from './ToolDiscovery.js';
import { ToolValidator, ValidationResult, ValidationSeverity } from './ToolValidator.js';
import { ServerGenerator, ServerGeneratorOptions, GenerationResult } from './ServerGenerator.js';

/**
 * Configuration for the build pipeline
 */
export interface BuildConfig {
  /** Project root directory */
  projectRoot: string;
  /** Tools directory (defaults to .idea/mcp/ts/tools) */
  toolsDir: string;
  /** Output directory for the generated server (defaults to .idea/mcp/generated) */
  outputDir: string;
  /** Server name */
  serverName: string;
  /** Server version */
  serverVersion: string;
  /** Transport type */
  transport: 'stdio' | 'http';
  /** HTTP port (only used with HTTP transport) */
  port?: number;
  /** Whether to skip validation */
  skipValidation?: boolean;
  /** Whether to skip dependency installation */
  skipDependencyInstall?: boolean;
  /** Whether to skip compilation */
  skipCompilation?: boolean;
  /** Whether to copy tool files to the output directory */
  copyToolFiles?: boolean;
}

/**
 * Result of the build process
 */
export interface BuildResult {
  /** Whether the build was successful */
  success: boolean;
  /** Discovery results */
  discovery: {
    tools: ToolInfo[];
    errors: string[];
  };
  /** Validation results */
  validation: {
    results: ValidationResult[];
    hasErrors: boolean;
  };
  /** Generation results */
  generation: {
    outputDir: string;
    generatedFiles: string[];
    errors: string[];
  };
  /** Compilation results */
  compilation: {
    success: boolean;
    output: string;
    errors: string[];
  };
  /** Build timing information */
  timing: {
    discovery: number;
    validation: number;
    generation: number;
    compilation: number;
    total: number;
  };
}

/**
 * Build pipeline for TypeScript to MCP server
 */
export class BuildPipeline {
  private config: BuildConfig;

  /**
   * Creates a new BuildPipeline instance
   *
   * @param config Build configuration
   */
  constructor(config: BuildConfig) {
    this.config = {
      ...config,
      toolsDir: config.toolsDir || '.idea/mcp/ts/tools',
      outputDir: config.outputDir || '.idea/mcp/generated',
      serverName: config.serverName || 'webstorm-mcp-server',
      serverVersion: config.serverVersion || '1.0.0',
      transport: config.transport || 'stdio',
      skipValidation: config.skipValidation || false,
      skipDependencyInstall: config.skipDependencyInstall || false,
      skipCompilation: config.skipCompilation || false,
      copyToolFiles: config.copyToolFiles !== undefined ? config.copyToolFiles : true,
    };
  }

  /**
   * Runs the build pipeline
   *
   * @returns Promise resolving to the build result
   */
  async build(): Promise<BuildResult> {
    const startTime = Date.now();

    // Initialize result object
    const result: BuildResult = {
      success: false,
      discovery: {
        tools: [],
        errors: [],
      },
      validation: {
        results: [],
        hasErrors: false,
      },
      generation: {
        outputDir: '',
        generatedFiles: [],
        errors: [],
      },
      compilation: {
        success: false,
        output: '',
        errors: [],
      },
      timing: {
        discovery: 0,
        validation: 0,
        generation: 0,
        compilation: 0,
        total: 0,
      },
    };

    try {
      // Step 1: Discovery
      console.log('🔍 Discovering tools...');
      const discoveryStartTime = Date.now();
      const discoveryResult = await this.discoverTools();
      result.timing.discovery = Date.now() - discoveryStartTime;

      result.discovery.tools = discoveryResult.tools;
      result.discovery.errors = discoveryResult.errors;

      if (discoveryResult.errors.length > 0) {
        console.error('❌ Tool discovery failed:');
        discoveryResult.errors.forEach((error) => console.error(`  - ${error}`));
      }

      if (discoveryResult.tools.length === 0) {
        console.warn('⚠️ No tools found in directory:', this.config.toolsDir);
        result.success = false;
        result.timing.total = Date.now() - startTime;
        return result;
      }

      console.log(`✅ Found ${discoveryResult.tools.length} tools`);

      // Step 2: Validation (if not skipped)
      if (!this.config.skipValidation) {
        console.log('🔍 Validating tools...');
        const validationStartTime = Date.now();
        const validationResults = await this.validateTools(discoveryResult.tools);
        result.timing.validation = Date.now() - validationStartTime;

        result.validation.results = validationResults;
        result.validation.hasErrors = validationResults.some((r) => !r.isValid);

        if (result.validation.hasErrors) {
          console.error('❌ Tool validation failed:');

          for (const validationResult of validationResults) {
            if (!validationResult.isValid) {
              console.error(
                `  Tool: ${validationResult.tool.className} (${validationResult.tool.filePath})`
              );

              const errors = validationResult.issues.filter(
                (i) => i.severity === ValidationSeverity.ERROR
              );
              for (const error of errors) {
                console.error(`    - ${error.message}`);
                if (error.fix) {
                  console.error(`      Fix: ${error.fix}`);
                }
              }
            }
          }

          // If validation failed, return early
          result.success = false;
          result.timing.total = Date.now() - startTime;
          return result;
        }

        console.log('✅ All tools validated successfully');
      }

      // Step 3: File Management (if copying tool files)
      if (this.config.copyToolFiles) {
        console.log('📁 Copying tool files...');
        await this.copyToolFiles(discoveryResult.tools);
      }

      // Step 4: Generation
      console.log('🔧 Generating server...');
      const generationStartTime = Date.now();
      const generationResult = await this.generateServer(discoveryResult.tools);
      result.timing.generation = Date.now() - generationStartTime;

      result.generation.outputDir = generationResult.outputDir;
      result.generation.generatedFiles = generationResult.generatedFiles;
      result.generation.errors = generationResult.errors;

      if (generationResult.errors.length > 0) {
        console.error('❌ Server generation failed:');
        generationResult.errors.forEach((error) => console.error(`  - ${error}`));

        // If generation failed, return early
        result.success = false;
        result.timing.total = Date.now() - startTime;
        return result;
      }

      console.log(`✅ Generated server in ${generationResult.outputDir}`);

      // Step 5: Dependency Installation (if not skipped)
      if (!this.config.skipDependencyInstall) {
        console.log('📦 Installing dependencies...');
        await this.installDependencies(generationResult.outputDir);
      }

      // Step 6: Compilation (if not skipped)
      if (!this.config.skipCompilation) {
        console.log('🔨 Compiling server...');
        const compilationStartTime = Date.now();
        const compilationResult = await this.compileServer(generationResult.outputDir);
        result.timing.compilation = Date.now() - compilationStartTime;

        result.compilation.success = compilationResult.success;
        result.compilation.output = compilationResult.output;
        result.compilation.errors = compilationResult.errors;

        if (!compilationResult.success) {
          console.error('❌ Server compilation failed:');
          compilationResult.errors.forEach((error) => console.error(`  - ${error}`));

          // If compilation failed, return early
          result.success = false;
          result.timing.total = Date.now() - startTime;
          return result;
        }

        console.log('✅ Server compiled successfully');
      }

      // All steps completed successfully
      result.success = true;

      // Generate WebStorm integration instructions
      this.generateWebStormInstructions(generationResult.outputDir);

      console.log('✅ Build completed successfully!');
    } catch (error) {
      console.error('❌ Build failed with an unexpected error:');
      console.error(error instanceof Error ? error.message : String(error));
      result.success = false;
    }

    result.timing.total = Date.now() - startTime;
    return result;
  }

  /**
   * Discovers tools in the tools directory
   *
   * @returns Promise resolving to the discovery result
   */
  private async discoverTools() {
    const options: DiscoveryOptions = {
      projectRoot: this.config.projectRoot,
      toolsDir: this.config.toolsDir,
    };

    return discoverTools(options);
  }

  /**
   * Validates the discovered tools
   *
   * @param tools Array of tool information
   * @returns Promise resolving to an array of validation results
   */
  private async validateTools(tools: ToolInfo[]): Promise<ValidationResult[]> {
    const validator = new ToolValidator();
    return validator.validateTools(tools);
  }

  /**
   * Copies tool files to the output directory
   *
   * @param tools Array of tool information
   */
  private async copyToolFiles(tools: ToolInfo[]): Promise<void> {
    const outputDir = path.resolve(this.config.projectRoot, this.config.outputDir);

    // Create output directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    for (const tool of tools) {
      // Read the tool file
      const content = await fs.readFile(tool.absolutePath, 'utf8');

      // Modify imports from 'mcp-framework/codegen' to './base-classes'
      const modifiedContent = content.replace(
        /from ['"]mcp-framework\/codegen['"];?/g,
        "from './base-classes.js';"
      );

      // Write the modified file to the output directory
      const outputPath = path.join(outputDir, tool.filePath);
      const outputDirname = path.dirname(outputPath);

      // Create directory if it doesn't exist
      if (!existsSync(outputDirname)) {
        mkdirSync(outputDirname, { recursive: true });
      }

      await fs.writeFile(outputPath, modifiedContent, 'utf8');
    }
  }

  /**
   * Generates the server
   *
   * @param tools Array of tool information
   * @returns Promise resolving to the generation result
   */
  private async generateServer(tools: ToolInfo[]): Promise<GenerationResult> {
    const options: ServerGeneratorOptions = {
      projectRoot: this.config.projectRoot,
      outputDir: this.config.outputDir,
      serverName: this.config.serverName,
      serverVersion: this.config.serverVersion,
      transport: this.config.transport,
      port: this.config.port,
    };

    const generator = new ServerGenerator(options);
    return generator.generateServer(tools);
  }

  /**
   * Installs dependencies in the output directory
   *
   * @param outputDir Output directory
   */
  private async installDependencies(outputDir: string): Promise<void> {
    try {
      await execa('npm', ['install'], {
        cwd: outputDir,
        stdio: 'inherit',
      });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Compiles the server
   *
   * @param outputDir Output directory
   * @returns Promise resolving to the compilation result
   */
  private async compileServer(outputDir: string): Promise<{
    success: boolean;
    output: string;
    errors: string[];
  }> {
    try {
      const result = await execa('npm', ['run', 'build'], {
        cwd: outputDir,
      });

      return {
        success: true,
        output: result.stdout,
        errors: [],
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  /**
   * Generates WebStorm integration instructions
   *
   * @param outputDir Output directory
   */
  private generateWebStormInstructions(outputDir: string): void {
    const serverPath = path.join(outputDir, 'dist', 'server.js');
    const relativePath = path.relative(this.config.projectRoot, serverPath);

    console.log('\n📝 WebStorm Integration Instructions:');
    console.log('Add the following to your claude_desktop_config.json:');
    console.log(
      JSON.stringify(
        {
          [this.config.serverName]: {
            command: 'node',
            args: [relativePath],
          },
        },
        null,
        2
      )
    );
    console.log('\nOr run the server directly with:');
    console.log(`node ${relativePath}`);
  }
}
