import { DiscoveredTool } from './ToolDiscovery.js';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'syntax' | 'structure' | 'schema' | 'runtime' | 'duplicate';
  message: string;
  file?: string;
  line?: number;
  toolName?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'best-practice' | 'documentation';
  message: string;
  file?: string;
  line?: number;
  toolName?: string;
}

export class ToolValidator {
  async validateTools(tools: DiscoveredTool[]): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check for duplicate tool names
    this.checkDuplicateNames(tools, errors);

    for (const tool of tools) {
      // Structural validation
      if (!tool.isValid) {
        errors.push({
          type: 'structure',
          message: `Invalid tool structure: ${tool.errors.join(', ')}`,
          file: tool.relativePath,
          toolName: tool.toolName
        });
        continue;
      }

      // Schema validation
      this.validateToolSchema(tool, errors, warnings);
      
      // Best practices
      this.checkBestPractices(tool, warnings);

      // Documentation checks
      this.checkDocumentation(tool, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private checkDuplicateNames(tools: DiscoveredTool[], errors: ValidationError[]): void {
    const nameMap = new Map<string, DiscoveredTool[]>();
    
    // Group tools by name
    for (const tool of tools) {
      if (!tool.toolName) continue;
      
      if (!nameMap.has(tool.toolName)) {
        nameMap.set(tool.toolName, []);
      }
      nameMap.get(tool.toolName)!.push(tool);
    }

    // Check for duplicates
    for (const [toolName, toolsWithSameName] of nameMap) {
      if (toolsWithSameName.length > 1) {
        for (const tool of toolsWithSameName) {
          errors.push({
            type: 'duplicate',
            message: `Duplicate tool name '${toolName}' found in multiple files`,
            file: tool.relativePath,
            toolName
          });
        }
      }
    }
  }

  private validateToolSchema(
    tool: DiscoveredTool, 
    errors: ValidationError[], 
    warnings: ValidationWarning[]
  ): void {
    // Tool name validation
    if (!tool.toolName || tool.toolName.length < 3) {
      errors.push({
        type: 'schema',
        message: 'Tool name must be at least 3 characters long',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    if (tool.toolName && tool.toolName.length > 50) {
      errors.push({
        type: 'schema',
        message: 'Tool name must be 50 characters or less',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    if (tool.toolName && !/^[a-z][a-z0-9-]*$/.test(tool.toolName)) {
      errors.push({
        type: 'schema',
        message: 'Tool name must be lowercase with hyphens (kebab-case)',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    // Description validation
    if (!tool.description || tool.description.length < 10) {
      errors.push({
        type: 'schema',
        message: 'Tool description must be at least 10 characters long',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    if (tool.description && tool.description.length > 200) {
      warnings.push({
        type: 'best-practice',
        message: 'Tool description is very long, consider shortening for better UX',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    // Class name validation
    if (tool.className && !this.isPascalCase(tool.className)) {
      warnings.push({
        type: 'best-practice',
        message: 'Tool class name should be in PascalCase',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }
  }

  private checkBestPractices(tool: DiscoveredTool, warnings: ValidationWarning[]): void {
    // Check for common best practices
    if (tool.toolName && tool.toolName.length > 30) {
      warnings.push({
        type: 'best-practice',
        message: 'Tool name is quite long, consider shortening for better UX',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    // Check if tool name matches file name pattern
    const expectedFileName = this.toolNameToFileName(tool.toolName);
    const actualFileName = tool.filePath.split('/').pop()?.replace('.ts', '');
    
    if (expectedFileName && actualFileName && !actualFileName.toLowerCase().includes(expectedFileName.toLowerCase())) {
      warnings.push({
        type: 'best-practice',
        message: `Consider naming the file to match the tool name (e.g., ${expectedFileName}.ts)`,
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }

    // Check category
    if (!tool.category || tool.category === 'User Tools') {
      warnings.push({
        type: 'best-practice',
        message: 'Consider setting a specific category for better organization',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }
  }

  private checkDocumentation(tool: DiscoveredTool, warnings: ValidationWarning[]): void {
    // Check if tool has examples
    // This would require more sophisticated AST analysis to check for examples property
    // For now, we'll add a general documentation warning
    
    if (tool.description && tool.description.length < 50) {
      warnings.push({
        type: 'documentation',
        message: 'Consider adding a more detailed description',
        file: tool.relativePath,
        toolName: tool.toolName
      });
    }
  }

  private isPascalCase(str: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(str);
  }

  private toolNameToFileName(toolName: string): string {
    // Convert kebab-case to PascalCase
    return toolName
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}