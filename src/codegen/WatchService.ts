import { watch, FSWatcher } from 'chokidar';
import { BuildPipeline, BuildResult } from './BuildPipeline.js';
import { GenerationConfig } from './ServerGenerator.js';

export interface WatchConfig {
  toolsDirectory: string;
  generationConfig: GenerationConfig;
  onRebuild?: (result: BuildResult) => void;
  onError?: (error: string) => void;
  debounceMs?: number;
}

export class WatchService {
  private watcher?: FSWatcher;
  private buildPipeline: BuildPipeline;
  private rebuildTimer?: NodeJS.Timeout;
  private isRebuilding = false;

  constructor(private config: WatchConfig) {
    this.buildPipeline = new BuildPipeline(config.generationConfig);
  }

  async start(): Promise<void> {
    console.log(`👀 Watching for changes in ${this.config.toolsDirectory}...`);
    console.log(`📁 Output directory: ${this.config.generationConfig.outputDirectory}`);
    
    // Initial build
    console.log('🚀 Performing initial build...');
    await this.rebuild();

    // Setup file watcher
    this.watcher = watch(this.config.toolsDirectory, {
      persistent: true,
      ignoreInitial: true,
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/.*', // Hidden files
        '**/*.js', // Ignore JS files
        '**/*.map' // Ignore source maps
      ],
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    this.watcher.on('change', (path) => this.scheduleRebuild(`Changed: ${path}`));
    this.watcher.on('add', (path) => this.scheduleRebuild(`Added: ${path}`));
    this.watcher.on('unlink', (path) => this.scheduleRebuild(`Removed: ${path}`));
    this.watcher.on('error', (error) => {
      const errorMsg = `File watcher error: ${error}`;
      console.error('❌', errorMsg);
      if (this.config.onError) {
        this.config.onError(errorMsg);
      }
    });

    console.log('✅ File watching started. MCP server will rebuild automatically on changes.');
    console.log('📝 Edit your tools in the tools directory to see live updates.');
    console.log('🛑 Press Ctrl+C to stop watching.');
  }

  async stop(): Promise<void> {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = undefined;
    }
    
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
      console.log('👋 File watching stopped.');
    }
  }

  async forceRebuild(): Promise<BuildResult> {
    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
      this.rebuildTimer = undefined;
    }
    return await this.rebuild();
  }

  private scheduleRebuild(reason: string): void {
    if (this.isRebuilding) {
      // If already rebuilding, schedule another rebuild after current one finishes
      if (this.rebuildTimer) {
        clearTimeout(this.rebuildTimer);
      }
      this.rebuildTimer = setTimeout(() => {
        if (!this.isRebuilding) {
          console.log(`\n🔄 Rebuilding MCP server (${reason})...`);
          this.rebuild();
        }
      }, this.config.debounceMs || 1000);
      return;
    }

    if (this.rebuildTimer) {
      clearTimeout(this.rebuildTimer);
    }

    const debounce = this.config.debounceMs || 1000;
    this.rebuildTimer = setTimeout(() => {
      console.log(`\n🔄 Rebuilding MCP server (${reason})...`);
      this.rebuild();
    }, debounce);
  }

  private async rebuild(): Promise<BuildResult> {
    if (this.isRebuilding) {
      console.log('⏳ Build already in progress, skipping...');
      return {
        success: false,
        errors: ['Build already in progress'],
        warnings: [],
        toolsDiscovered: 0,
        toolsValid: 0,
        buildTime: 0
      };
    }

    this.isRebuilding = true;
    
    try {
      const result = await this.buildPipeline.build();
      
      if (result.success) {
        console.log(`✅ MCP server rebuilt successfully in ${result.buildTime}ms`);
        if (result.compiledServerPath) {
          console.log(`🚀 Compiled server: ${result.compiledServerPath}`);
        }
        console.log(`📊 Tools: ${result.toolsValid}/${result.toolsDiscovered} valid`);
        
        if (result.warnings.length > 0) {
          console.log('⚠️  Warnings:');
          result.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
      } else {
        console.log('❌ MCP server build failed:');
        result.errors.forEach(error => console.log(`   - ${error}`));
      }

      if (this.config.onRebuild) {
        this.config.onRebuild(result);
      }

      return result;
    } catch (error) {
      const errorMsg = `Rebuild failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('💥', errorMsg);
      
      if (this.config.onError) {
        this.config.onError(errorMsg);
      }

      const failedResult: BuildResult = {
        success: false,
        errors: [errorMsg],
        warnings: [],
        toolsDiscovered: 0,
        toolsValid: 0,
        buildTime: 0
      };

      if (this.config.onRebuild) {
        this.config.onRebuild(failedResult);
      }

      return failedResult;
    } finally {
      this.isRebuilding = false;
    }
  }

  // Get current status
  get isWatching(): boolean {
    return this.watcher !== undefined;
  }

  get isCurrentlyRebuilding(): boolean {
    return this.isRebuilding;
  }
}