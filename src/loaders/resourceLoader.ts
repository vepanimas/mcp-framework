import { ResourceProtocol } from '../resources/BaseResource.js';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import { logger } from '../core/Logger.js';
import { discoverFilesRecursively, hasValidFiles } from '../utils/fileDiscovery.js';

export class ResourceLoader {
  private readonly RESOURCES_DIR: string;
  private readonly EXCLUDED_FILES = ['BaseResource.js', '*.test.js', '*.spec.js'];

  constructor(basePath?: string) {
    if (basePath) {
      // If basePath is provided, it should be the directory containing the resources folder
      this.RESOURCES_DIR = join(basePath, 'resources');
    } else {
      // For backwards compatibility, use the old behavior with process.argv[1]
      const mainModulePath = process.argv[1];
      this.RESOURCES_DIR = join(dirname(mainModulePath), 'resources');
    }
    logger.debug(`Initialized ResourceLoader with directory: ${this.RESOURCES_DIR}`);
  }

  async hasResources(): Promise<boolean> {
    try {
      return await hasValidFiles(this.RESOURCES_DIR, {
        extensions: ['.js'],
        excludePatterns: this.EXCLUDED_FILES,
      });
    } catch (error) {
      logger.debug(`No resources directory found: ${(error as Error).message}`);
      return false;
    }
  }

  private validateResource(resource: any): resource is ResourceProtocol {
    const isValid = Boolean(
      resource &&
        typeof resource.uri === 'string' &&
        typeof resource.name === 'string' &&
        resource.resourceDefinition &&
        typeof resource.read === 'function'
    );

    if (isValid) {
      logger.debug(`Validated resource: ${resource.name}`);
    } else {
      logger.warn(`Invalid resource found: missing required properties`);
    }

    return isValid;
  }

  async loadResources(): Promise<ResourceProtocol[]> {
    try {
      logger.debug(`Attempting to load resources from: ${this.RESOURCES_DIR}`);

      const resourceFiles = await discoverFilesRecursively(this.RESOURCES_DIR, {
        extensions: ['.js'],
        excludePatterns: this.EXCLUDED_FILES,
      });

      if (resourceFiles.length === 0) {
        logger.debug('No resource files found');
        return [];
      }

      logger.debug(`Found resource files: ${resourceFiles.join(', ')}`);

      const resources: ResourceProtocol[] = [];

      for (const file of resourceFiles) {
        try {
          const fullPath = join(this.RESOURCES_DIR, file);
          logger.debug(`Attempting to load resource from: ${fullPath}`);

          const importPath = `file://${fullPath}`;
          const { default: ResourceClass } = await import(importPath);

          if (!ResourceClass) {
            logger.warn(`No default export found in ${file}`);
            continue;
          }

          const resource = new ResourceClass();
          if (this.validateResource(resource)) {
            resources.push(resource);
          }
        } catch (error) {
          logger.error(`Error loading resource ${file}: ${(error as Error).message}`);
        }
      }

      logger.debug(
        `Successfully loaded ${resources.length} resources: ${resources.map((r) => r.name).join(', ')}`
      );
      return resources;
    } catch (error) {
      logger.error(`Failed to load resources: ${(error as Error).message}`);
      return [];
    }
  }
}
