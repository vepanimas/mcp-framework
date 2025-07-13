import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { findUp } from 'find-up';

/**
 * Information about a discovered tool
 */
export interface ToolInfo {
  /** File path relative to the tools directory */
  filePath: string;
  /** Absolute file path */
  absolutePath: string;
  /** Class name of the tool */
  className: string;
  /** Tool name from the static property */
  toolName: string;
  /** Tool description from the static property */
  description: string;
}

/**
 * Options for tool discovery
 */
export interface DiscoveryOptions {
  /** Project root directory (defaults to current working directory) */
  projectRoot?: string;
  /** Tools directory (defaults to .idea/mcp/ts/tools) */
  toolsDir?: string;
  /** Whether to include test files (defaults to false) */
  includeTests?: boolean;
}

/**
 * Result of the tool discovery process
 */
export interface DiscoveryResult {
  /** List of discovered tools */
  tools: ToolInfo[];
  /** Project root directory */
  projectRoot: string;
  /** Tools directory */
  toolsDir: string;
  /** Absolute path to the tools directory */
  absoluteToolsDir: string;
  /** Any errors encountered during discovery */
  errors: string[];
}

/**
 * Discovers TypeScript tool definitions in the specified directory
 * using the TypeScript Compiler API for accurate AST-based analysis
 */
export class ToolDiscovery {
  private projectRoot: string;
  private toolsDir: string;
  private includeTests: boolean;
  private errors: string[] = [];

  /**
   * Creates a new ToolDiscovery instance
   *
   * @param options Discovery options
   */
  constructor(options: DiscoveryOptions = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.toolsDir = options.toolsDir || '.idea/mcp/ts/tools';
    this.includeTests = options.includeTests || false;
  }

  /**
   * Discovers all tool definitions in the tools directory
   *
   * @returns Promise resolving to the discovery result
   */
  async discoverTools(): Promise<DiscoveryResult> {
    this.errors = [];
    const tools: ToolInfo[] = [];

    try {
      // Find project root if not explicitly provided
      if (!this.projectRoot) {
        const pkgPath = await findUp('package.json', { cwd: process.cwd() });
        if (pkgPath) {
          this.projectRoot = path.dirname(pkgPath);
        }
      }

      const absoluteToolsDir = path.resolve(this.projectRoot, this.toolsDir);

      // Check if tools directory exists
      if (!existsSync(absoluteToolsDir)) {
        this.errors.push(`Tools directory not found: ${absoluteToolsDir}`);
        return {
          tools: [],
          projectRoot: this.projectRoot,
          toolsDir: this.toolsDir,
          absoluteToolsDir,
          errors: this.errors,
        };
      }

      // Get all TypeScript files in the tools directory
      const files = await this.getTypeScriptFiles(absoluteToolsDir);

      // Create a TypeScript program to analyze the files
      const program = this.createProgram(files);
      const checker = program.getTypeChecker();

      // Analyze each source file
      for (const sourceFile of program.getSourceFiles()) {
        // Skip declaration files and files outside the tools directory
        if (sourceFile.isDeclarationFile || !sourceFile.fileName.startsWith(absoluteToolsDir)) {
          continue;
        }

        // Skip test files if not included
        if (!this.includeTests && this.isTestFile(sourceFile.fileName)) {
          continue;
        }

        // Find tool classes in the source file
        const toolClasses = this.findToolClasses(sourceFile, checker);

        for (const toolClass of toolClasses) {
          const relativePath = path.relative(absoluteToolsDir, sourceFile.fileName);

          tools.push({
            filePath: relativePath,
            absolutePath: sourceFile.fileName,
            className: toolClass.name,
            toolName: toolClass.toolName,
            description: toolClass.description,
          });
        }
      }

      return {
        tools,
        projectRoot: this.projectRoot,
        toolsDir: this.toolsDir,
        absoluteToolsDir,
        errors: this.errors,
      };
    } catch (error) {
      this.errors.push(
        `Error during tool discovery: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        tools: [],
        projectRoot: this.projectRoot,
        toolsDir: this.toolsDir,
        absoluteToolsDir: path.resolve(this.projectRoot, this.toolsDir),
        errors: this.errors,
      };
    }
  }

  /**
   * Gets all TypeScript files in a directory recursively
   *
   * @param dir Directory to search
   * @returns Array of file paths
   */
  private async getTypeScriptFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function traverse(currentDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }

    await traverse(dir);
    return files;
  }

  /**
   * Creates a TypeScript program for the specified files
   *
   * @param files Array of file paths
   * @returns TypeScript Program
   */
  private createProgram(files: string[]): ts.Program {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
    };

    const host = ts.createCompilerHost(options);
    return ts.createProgram(files, options, host);
  }

  /**
   * Checks if a file is a test file
   *
   * @param filePath File path to check
   * @returns True if the file is a test file
   */
  private isTestFile(filePath: string): boolean {
    const fileName = path.basename(filePath);
    return (
      fileName.includes('.test.') ||
      fileName.includes('.spec.') ||
      fileName.startsWith('test') ||
      fileName.endsWith('Test.ts')
    );
  }

  /**
   * Finds all tool classes in a source file
   *
   * @param sourceFile Source file to analyze
   * @param checker Type checker
   * @returns Array of tool class information
   */
  private findToolClasses(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker
  ): Array<{
    name: string;
    toolName: string;
    description: string;
  }> {
    const result: Array<{ name: string; toolName: string; description: string }> = [];

    // Visit each node in the source file - use arrow function to preserve 'this' context
    const visit = (node: ts.Node) => {
      // Look for class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;

        // Check if the class extends MCPTool
        if (extendsToolClass(node, checker)) {
          // Extract tool name and description from properties
          const toolName = getPropertyValue(node, 'name');
          const description = getPropertyValue(node, 'description');

          if (toolName && description) {
            result.push({
              name: className,
              toolName,
              description,
            });
          } else {
            // Add error if name or description is missing
            if (!toolName) {
              this.errors.push(`Class ${className} is missing a 'name' property`);
            }
            if (!description) {
              this.errors.push(`Class ${className} is missing a 'description' property`);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    /**
     * Checks if a class extends MCPTool
     */
    function extendsToolClass(node: ts.ClassDeclaration, checker: ts.TypeChecker): boolean {
      if (!node.heritageClauses) {
        return false;
      }

      for (const clause of node.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            const symbol = checker.getSymbolAtLocation(type.expression);
            if (symbol && symbol.name === 'MCPTool') {
              return true;
            }
          }
        }
      }

      return false;
    }

    /**
     * Gets the value of a property from a class declaration
     */
    function getPropertyValue(node: ts.ClassDeclaration, propertyName: string): string | undefined {
      for (const member of node.members) {
        if (
          ts.isPropertyDeclaration(member) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === propertyName
        ) {
          // Check for string literal initializer
          if (member.initializer && ts.isStringLiteral(member.initializer)) {
            return member.initializer.text;
          }
        }
      }

      return undefined;
    }

    visit(sourceFile);
    return result;
  }
}

/**
 * Discovers tools in the specified directory
 *
 * @param options Discovery options
 * @returns Promise resolving to the discovery result
 */
export async function discoverTools(options: DiscoveryOptions = {}): Promise<DiscoveryResult> {
  const discovery = new ToolDiscovery(options);
  return discovery.discoverTools();
}
