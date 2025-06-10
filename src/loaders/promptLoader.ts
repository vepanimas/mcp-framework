import { PromptProtocol } from '../prompts/BasePrompt.js';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import { logger } from '../core/Logger.js';
import { discoverFilesRecursively, hasValidFiles } from '../utils/fileDiscovery.js';

export class PromptLoader {
  private readonly PROMPTS_DIR: string;
  private readonly EXCLUDED_FILES = ['BasePrompt.js', '*.test.js', '*.spec.js'];

  constructor(basePath?: string) {
    if (basePath) {
      // If basePath is provided, it should be the directory containing the prompts folder
      this.PROMPTS_DIR = join(basePath, 'prompts');
    } else {
      // For backwards compatibility, use the old behavior with process.argv[1]
      const mainModulePath = process.argv[1];
      this.PROMPTS_DIR = join(dirname(mainModulePath), 'prompts');
    }
    logger.debug(`Initialized PromptLoader with directory: ${this.PROMPTS_DIR}`);
  }

  async hasPrompts(): Promise<boolean> {
    try {
      return await hasValidFiles(this.PROMPTS_DIR, {
        extensions: ['.js'],
        excludePatterns: this.EXCLUDED_FILES,
      });
    } catch (error) {
      logger.debug(`No prompts directory found: ${(error as Error).message}`);
      return false;
    }
  }

  private validatePrompt(prompt: any): prompt is PromptProtocol {
    const isValid = Boolean(
      prompt &&
        typeof prompt.name === 'string' &&
        prompt.promptDefinition &&
        typeof prompt.getMessages === 'function'
    );

    if (isValid) {
      logger.debug(`Validated prompt: ${prompt.name}`);
    } else {
      logger.warn(`Invalid prompt found: missing required properties`);
    }

    return isValid;
  }

  async loadPrompts(): Promise<PromptProtocol[]> {
    try {
      logger.debug(`Attempting to load prompts from: ${this.PROMPTS_DIR}`);

      const promptFiles = await discoverFilesRecursively(this.PROMPTS_DIR, {
        extensions: ['.js'],
        excludePatterns: this.EXCLUDED_FILES,
      });

      if (promptFiles.length === 0) {
        logger.debug('No prompt files found');
        return [];
      }

      logger.debug(`Found prompt files: ${promptFiles.join(', ')}`);

      const prompts: PromptProtocol[] = [];

      for (const file of promptFiles) {
        try {
          const fullPath = join(this.PROMPTS_DIR, file);
          logger.debug(`Attempting to load prompt from: ${fullPath}`);

          const importPath = `file://${fullPath}`;
          const { default: PromptClass } = await import(importPath);

          if (!PromptClass) {
            logger.warn(`No default export found in ${file}`);
            continue;
          }

          const prompt = new PromptClass();
          if (this.validatePrompt(prompt)) {
            prompts.push(prompt);
          }
        } catch (error) {
          logger.error(`Error loading prompt ${file}: ${(error as Error).message}`);
        }
      }

      logger.debug(
        `Successfully loaded ${prompts.length} prompts: ${prompts.map((p) => p.name).join(', ')}`
      );
      return prompts;
    } catch (error) {
      logger.error(`Failed to load prompts: ${(error as Error).message}`);
      return [];
    }
  }
}
