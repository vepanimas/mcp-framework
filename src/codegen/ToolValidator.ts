import * as ts from 'typescript';
import * as path from 'path';
import { existsSync, readFileSync } from 'fs';
import { ToolInfo } from './ToolDiscovery.js';

/**
 * Validation severity levels
 */
export enum ValidationSeverity {
  /** Critical issues that must be fixed */
  ERROR = 'error',
  /** Issues that should be fixed but won't block the build */
  WARNING = 'warning',
  /** Suggestions for improvement */
  INFO = 'info',
}

/**
 * Validation issue with location and message
 */
export interface ValidationIssue {
  /** File path where the issue was found */
  filePath: string;
  /** Line number where the issue was found (1-based) */
  line?: number;
  /** Column number where the issue was found (1-based) */
  column?: number;
  /** Issue message */
  message: string;
  /** Issue severity */
  severity: ValidationSeverity;
  /** Suggested fix if available */
  fix?: string;
}

/**
 * Result of tool validation
 */
export interface ValidationResult {
  /** Tool information */
  tool: ToolInfo;
  /** Validation issues */
  issues: ValidationIssue[];
  /** Whether the tool is valid (no errors) */
  isValid: boolean;
}

/**
 * Options for tool validation
 */
export interface ValidationOptions {
  /** Whether to enforce best practices */
  enforceBestPractices?: boolean;
  /** Whether to check for external dependencies */
  checkDependencies?: boolean;
  /** Whether to validate schema descriptions */
  validateSchemaDescriptions?: boolean;
}

/**
 * Validates MCP tools for WebStorm integration
 */
export class ToolValidator {
  private options: ValidationOptions;

  /**
   * Creates a new ToolValidator instance
   *
   * @param options Validation options
   */
  constructor(options: ValidationOptions = {}) {
    this.options = {
      enforceBestPractices: options.enforceBestPractices ?? true,
      checkDependencies: options.checkDependencies ?? true,
      validateSchemaDescriptions: options.validateSchemaDescriptions ?? true,
    };
  }

  /**
   * Validates a tool
   *
   * @param tool Tool information
   * @returns Validation result
   */
  async validateTool(tool: ToolInfo): Promise<ValidationResult> {
    const issues: ValidationIssue[] = [];

    // Check if file exists
    if (!existsSync(tool.absolutePath)) {
      issues.push({
        filePath: tool.filePath,
        message: `File not found: ${tool.absolutePath}`,
        severity: ValidationSeverity.ERROR,
      });

      return {
        tool,
        issues,
        isValid: false,
      };
    }

    // Validate tool name (kebab-case)
    if (!/^[a-z0-9-]+$/.test(tool.toolName)) {
      issues.push({
        filePath: tool.filePath,
        message: `Tool name "${tool.toolName}" must be kebab-case (lowercase with hyphens)`,
        severity: ValidationSeverity.ERROR,
        fix: `Change the name to kebab-case, e.g., "${this.toKebabCase(tool.toolName)}"`,
      });
    }

    // Validate description length
    if (tool.description.length < 10) {
      issues.push({
        filePath: tool.filePath,
        message: `Tool description is too short (${tool.description.length} chars). It should be at least 10 characters.`,
        severity: ValidationSeverity.ERROR,
        fix: 'Provide a more detailed description of what the tool does',
      });
    }

    // Create TypeScript program for more detailed analysis
    const program = this.createProgram([tool.absolutePath]);
    const sourceFile = program.getSourceFile(tool.absolutePath);
    const checker = program.getTypeChecker();

    if (sourceFile) {
      // Validate class structure
      this.validateClassStructure(sourceFile, checker, tool, issues);

      // Validate schema if enabled
      if (this.options.validateSchemaDescriptions) {
        this.validateSchema(sourceFile, checker, tool, issues);
      }

      // Check dependencies if enabled
      if (this.options.checkDependencies) {
        this.checkDependencies(sourceFile, tool, issues);
      }

      // Enforce best practices if enabled
      if (this.options.enforceBestPractices) {
        this.enforceBestPractices(sourceFile, checker, tool, issues);
      }
    } else {
      issues.push({
        filePath: tool.filePath,
        message: `Failed to parse file: ${tool.absolutePath}`,
        severity: ValidationSeverity.ERROR,
      });
    }

    return {
      tool,
      issues,
      isValid: !issues.some((issue) => issue.severity === ValidationSeverity.ERROR),
    };
  }

  /**
   * Validates multiple tools
   *
   * @param tools Array of tool information
   * @returns Array of validation results
   */
  async validateTools(tools: ToolInfo[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const tool of tools) {
      results.push(await this.validateTool(tool));
    }

    return results;
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
   * Validates the class structure of a tool
   *
   * @param sourceFile Source file to analyze
   * @param checker Type checker
   * @param tool Tool information
   * @param issues Array to add issues to
   */
  private validateClassStructure(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    tool: ToolInfo,
    issues: ValidationIssue[]
  ): void {
    // Find the class declaration
    let classDeclaration: ts.ClassDeclaration | undefined;

    function findClass(node: ts.Node): void {
      if (ts.isClassDeclaration(node) && node.name?.text === tool.className) {
        classDeclaration = node;
        return;
      }
      ts.forEachChild(node, findClass);
    }

    findClass(sourceFile);

    if (!classDeclaration) {
      issues.push({
        filePath: tool.filePath,
        message: `Class ${tool.className} not found in file`,
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    // Check if the class extends MCPTool
    let extendsMCPTool = false;
    if (classDeclaration.heritageClauses) {
      for (const clause of classDeclaration.heritageClauses) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          for (const type of clause.types) {
            const symbol = checker.getSymbolAtLocation(type.expression);
            if (symbol && symbol.name === 'MCPTool') {
              extendsMCPTool = true;
              break;
            }
          }
        }
      }
    }

    if (!extendsMCPTool) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        classDeclaration.name?.getStart() || 0
      );
      issues.push({
        filePath: tool.filePath,
        line: line + 1,
        column: character + 1,
        message: `Class ${tool.className} must extend MCPTool`,
        severity: ValidationSeverity.ERROR,
        fix: `Change class declaration to: "export class ${tool.className} extends MCPTool"`,
      });
    }

    // Check for required properties and methods
    const requiredMembers = ['name', 'description', 'schema', 'execute'];
    const missingMembers: string[] = [];

    for (const required of requiredMembers) {
      let found = false;

      for (const member of classDeclaration.members) {
        if (
          (ts.isPropertyDeclaration(member) || ts.isMethodDeclaration(member)) &&
          member.name &&
          ts.isIdentifier(member.name) &&
          member.name.text === required
        ) {
          found = true;
          break;
        }
      }

      if (!found) {
        missingMembers.push(required);
      }
    }

    if (missingMembers.length > 0) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        classDeclaration.name?.getStart() || 0
      );
      issues.push({
        filePath: tool.filePath,
        line: line + 1,
        column: character + 1,
        message: `Class ${tool.className} is missing required members: ${missingMembers.join(', ')}`,
        severity: ValidationSeverity.ERROR,
        fix: `Add the missing members to the class: ${missingMembers.map((m) => `${m}: ...`).join(', ')}`,
      });
    }
  }

  /**
   * Validates the schema of a tool
   *
   * @param sourceFile Source file to analyze
   * @param checker Type checker
   * @param tool Tool information
   * @param issues Array to add issues to
   */
  private validateSchema(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    tool: ToolInfo,
    issues: ValidationIssue[]
  ): void {
    // Find the schema property
    let schemaProperty: ts.PropertyDeclaration | undefined;

    function findSchema(node: ts.Node): void {
      if (
        ts.isPropertyDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'schema'
      ) {
        schemaProperty = node;
        return;
      }

      if (!ts.isClassDeclaration(node) || (node.name && node.name.text !== tool.className)) {
        ts.forEachChild(node, findSchema);
      }
    }

    findSchema(sourceFile);

    if (!schemaProperty) {
      issues.push({
        filePath: tool.filePath,
        message: `Schema property not found in class ${tool.className}`,
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    // Check if schema is a Zod object
    const schemaText = schemaProperty.initializer
      ? sourceFile.text.substring(
          schemaProperty.initializer.getStart(),
          schemaProperty.initializer.getEnd()
        )
      : '';

    if (!schemaText.includes('z.object(') && !schemaText.includes('defineSchema(')) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        schemaProperty.getStart()
      );
      issues.push({
        filePath: tool.filePath,
        line: line + 1,
        column: character + 1,
        message: 'Schema should be defined using z.object() or defineSchema()',
        severity: ValidationSeverity.WARNING,
        fix: 'Use z.object() or defineSchema() to define your schema with proper types and descriptions',
      });
    }

    // Check for .describe() calls in schema
    if (!schemaText.includes('.describe(')) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        schemaProperty.getStart()
      );
      issues.push({
        filePath: tool.filePath,
        line: line + 1,
        column: character + 1,
        message: 'Schema fields should have descriptions using .describe()',
        severity: ValidationSeverity.WARNING,
        fix: 'Add .describe("Description") to each field in your schema',
      });
    }
  }

  /**
   * Checks for external dependencies in a tool
   *
   * @param sourceFile Source file to analyze
   * @param tool Tool information
   * @param issues Array to add issues to
   */
  private checkDependencies(
    sourceFile: ts.SourceFile,
    tool: ToolInfo,
    issues: ValidationIssue[]
  ): void {
    // Find import declarations
    const imports: { name: string; path: string; node: ts.ImportDeclaration }[] = [];

    function findImports(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;

        // Get imported names
        if (node.importClause) {
          if (node.importClause.name) {
            imports.push({
              name: node.importClause.name.text,
              path: importPath,
              node,
            });
          }

          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                imports.push({
                  name: element.name.text,
                  path: importPath,
                  node,
                });
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              imports.push({
                name: node.importClause.namedBindings.name.text,
                path: importPath,
                node,
              });
            }
          }
        }
      }

      ts.forEachChild(node, findImports);
    }

    findImports(sourceFile);

    // Check for external dependencies (not from mcp-framework or node built-ins)
    const allowedImports = [
      'mcp-framework',
      'mcp-framework/codegen',
      'zod',
      'path',
      'fs',
      'util',
      'crypto',
      'os',
      'child_process',
    ];

    for (const importInfo of imports) {
      if (
        !importInfo.path.startsWith('.') && // Not a relative import
        !importInfo.path.startsWith('/') && // Not an absolute import
        !allowedImports.some(
          (allowed) => importInfo.path === allowed || importInfo.path.startsWith(`${allowed}/`)
        )
      ) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          importInfo.node.getStart()
        );
        issues.push({
          filePath: tool.filePath,
          line: line + 1,
          column: character + 1,
          message: `External dependency "${importInfo.path}" may not be available in the WebStorm environment`,
          severity: ValidationSeverity.WARNING,
          fix: 'Consider using built-in modules or mcp-framework utilities instead',
        });
      }
    }
  }

  /**
   * Enforces best practices for tool development
   *
   * @param sourceFile Source file to analyze
   * @param checker Type checker
   * @param tool Tool information
   * @param issues Array to add issues to
   */
  private enforceBestPractices(
    sourceFile: ts.SourceFile,
    checker: ts.TypeChecker,
    tool: ToolInfo,
    issues: ValidationIssue[]
  ): void {
    // Check for execute method implementation
    let executeMethod: ts.MethodDeclaration | undefined;

    function findExecuteMethod(node: ts.Node): void {
      if (
        ts.isMethodDeclaration(node) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'execute'
      ) {
        executeMethod = node;
        return;
      }

      if (!ts.isClassDeclaration(node) || (node.name && node.name.text !== tool.className)) {
        ts.forEachChild(node, findExecuteMethod);
      }
    }

    findExecuteMethod(sourceFile);

    if (executeMethod) {
      // Check for error handling in execute method
      const executeBody = executeMethod.body;
      const executeText = executeBody
        ? sourceFile.text.substring(executeBody.getStart(), executeBody.getEnd())
        : '';

      if (!executeText.includes('try') || !executeText.includes('catch')) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          executeMethod.getStart()
        );
        issues.push({
          filePath: tool.filePath,
          line: line + 1,
          column: character + 1,
          message: 'Execute method should include try/catch for error handling',
          severity: ValidationSeverity.INFO,
          fix: 'Wrap your execute method implementation in try/catch and use this.errorResponse() for errors',
        });
      }

      // Check for context parameter usage
      const hasContextParam = executeMethod.parameters.length > 1;
      const usesContext = executeText.includes('context.');

      if (hasContextParam && !usesContext) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          executeMethod.getStart()
        );
        issues.push({
          filePath: tool.filePath,
          line: line + 1,
          column: character + 1,
          message: 'Context parameter is defined but not used in execute method',
          severity: ValidationSeverity.INFO,
          fix: 'Either use the context parameter or remove it from the method signature',
        });
      }
    }

    // Check for class documentation
    const classDoc = this.getLeadingCommentForNode(sourceFile, tool.className);
    if (!classDoc || classDoc.length < 30) {
      issues.push({
        filePath: tool.filePath,
        message: `Class ${tool.className} should have comprehensive documentation`,
        severity: ValidationSeverity.INFO,
        fix: 'Add a detailed JSDoc comment explaining what the tool does, its inputs, and outputs',
      });
    }
  }

  /**
   * Gets the leading comment for a node by name
   *
   * @param sourceFile Source file to analyze
   * @param nodeName Name of the node to find
   * @returns Comment text or undefined if not found
   */
  private getLeadingCommentForNode(
    sourceFile: ts.SourceFile,
    nodeName: string
  ): string | undefined {
    let result: string | undefined;

    function findNode(node: ts.Node): void {
      if (
        (ts.isClassDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isPropertyDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === nodeName
      ) {
        const fullText = sourceFile.getFullText();
        const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());

        if (commentRanges && commentRanges.length > 0) {
          result = commentRanges
            .map((range) => fullText.substring(range.pos, range.end))
            .join('\n');
        }

        return;
      }

      ts.forEachChild(node, findNode);
    }

    findNode(sourceFile);
    return result;
  }

  /**
   * Converts a string to kebab-case
   *
   * @param str String to convert
   * @returns Kebab-case string
   */
  private toKebabCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }
}
