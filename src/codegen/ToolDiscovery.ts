import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, relative } from 'path';
import * as ts from 'typescript';

export interface DiscoveredTool {
  filePath: string;
  relativePath: string;
  className: string;
  toolName: string;
  description: string;
  category: string;
  isValid: boolean;
  errors: string[];
  hasDefaultExport: boolean;
}

export class ToolDiscovery {
  constructor(private toolsDirectory: string, private projectRoot: string) {}

  async discoverTools(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = [];
    
    try {
      const files = await this.findTypeScriptFiles(this.toolsDirectory);
      
      for (const filePath of files) {
        const tool = await this.analyzeToolFile(filePath);
        if (tool) {
          tools.push(tool);
        }
      }
    } catch (error) {
      console.error('Error discovering tools:', error);
    }
    
    return tools;
  }

  private async findTypeScriptFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    const scanDirectory = async (dir: string) => {
      try {
        const entries = await readdir(dir);
        
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stats = await stat(fullPath);
          
          if (stats.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (extname(entry) === '.ts' && !entry.endsWith('.d.ts')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Directory doesn't exist or no permission
      }
    };
    
    await scanDirectory(directory);
    return files;
  }

  private async analyzeToolFile(filePath: string): Promise<DiscoveredTool | null> {
    try {
      const sourceCode = await readFile(filePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.ES2022,
        true
      );

      const errors: string[] = [];
      let className = '';
      let toolName = '';
      let description = '';
      let category = 'User Tools';
      let isValid = false;
      let hasDefaultExport = false;

      // Analyze AST to extract tool information
      const visit = (node: ts.Node) => {
        // Check for class declarations
        if (ts.isClassDeclaration(node)) {
          if (node.name) {
            className = node.name.text;
            const analysis = this.analyzeToolClass(node);
            
            toolName = analysis.toolName;
            description = analysis.description;
            category = analysis.category;
            isValid = analysis.isValid;
            errors.push(...analysis.errors);
          }
        }

        // Check for default export
        if (ts.isExportAssignment(node) && !node.isExportEquals) {
          hasDefaultExport = true;
        } else if (ts.isClassDeclaration(node) && 
                   node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword) &&
                   node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword)) {
          hasDefaultExport = true;
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);

      if (!hasDefaultExport && isValid) {
        errors.push('Tool class must be the default export');
        isValid = false;
      }

      const relativePath = relative(this.projectRoot, filePath);

      return {
        filePath,
        relativePath,
        className,
        toolName,
        description,
        category,
        isValid,
        errors,
        hasDefaultExport
      };
    } catch (error) {
      return {
        filePath,
        relativePath: relative(this.projectRoot, filePath),
        className: '',
        toolName: '',
        description: '',
        category: '',
        isValid: false,
        errors: [`Failed to analyze file: ${error}`],
        hasDefaultExport: false
      };
    }
  }

  private analyzeToolClass(node: ts.ClassDeclaration): {
    toolName: string;
    description: string;
    category: string;
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    let toolName = '';
    let description = '';
    let category = 'User Tools';
    let hasName = false;
    let hasDescription = false;
    let hasSchema = false;
    let hasExecute = false;
    let extendsBaseClass = false;

    // Check inheritance
    if (node.heritageClauses) {
      for (const heritage of node.heritageClauses) {
        if (heritage.token === ts.SyntaxKind.ExtendsKeyword) {
          const baseClass = heritage.types[0]?.expression;
          if (ts.isIdentifier(baseClass) && baseClass.text === 'MCPTool') {
            extendsBaseClass = true;
          }
        }
      }
    }

    if (!extendsBaseClass) {
      errors.push('Tool class must extend MCPTool');
    }

    // Check required properties and methods
    for (const member of node.members) {
      if (ts.isPropertyDeclaration(member) && member.name) {
        const propertyName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
        
        switch (propertyName) {
          case 'name':
            hasName = true;
            if (member.initializer && ts.isStringLiteral(member.initializer)) {
              toolName = member.initializer.text;
            }
            break;
          case 'description':
            hasDescription = true;
            if (member.initializer && ts.isStringLiteral(member.initializer)) {
              description = member.initializer.text;
            }
            break;
          case 'schema':
            hasSchema = true;
            break;
          case 'category':
            if (member.initializer && ts.isStringLiteral(member.initializer)) {
              category = member.initializer.text;
            }
            break;
        }
      } else if (ts.isMethodDeclaration(member) && member.name) {
        const methodName = ts.isIdentifier(member.name) ? member.name.text : member.name.getText();
        if (methodName === 'execute') {
          hasExecute = true;
          
          // Check method signature
          if (!this.validateExecuteMethod(member)) {
            errors.push('execute method must be async and return Promise<ToolResult>');
          }
        }
      }
    }

    // Validate required properties
    if (!hasName) errors.push('Missing required property: name');
    if (!hasDescription) errors.push('Missing required property: description');
    if (!hasSchema) errors.push('Missing required property: schema');
    if (!hasExecute) errors.push('Missing required method: execute');

    // Validate tool name format
    if (toolName && !/^[a-z][a-z0-9-]*$/.test(toolName)) {
      errors.push('Tool name must be lowercase with hyphens (kebab-case)');
    }

    const isValid = extendsBaseClass && hasName && hasDescription && hasSchema && hasExecute && errors.length === 0;

    return {
      toolName,
      description,
      category,
      isValid,
      errors
    };
  }

  private validateExecuteMethod(method: ts.MethodDeclaration): boolean {
    // Check if method is async
    const isAsync = method.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword);
    if (!isAsync) return false;

    // Check return type (should be Promise<ToolResult>)
    if (method.type) {
      const returnType = method.type.getText();
      return returnType.includes('Promise') && returnType.includes('ToolResult');
    }

    return true;
  }
}