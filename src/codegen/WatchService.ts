import * as chokidar from 'chokidar';
import * as path from 'path';
import { BuildPipeline, BuildConfig, BuildResult } from './BuildPipeline.js';

/**
 * Options for the watch service
 */
export interface WatchOptions extends BuildConfig {
  /** Debounce time in milliseconds (defaults to 1000) */
  debounceTime?: number;
  /** Whether to watch for changes in subdirectories (defaults to true) */
  watchSubdirectories?: boolean;
  /** Callback function to run after each build */
  onBuildComplete?: (result: BuildResult) => void;
  /** Callback function to run when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Service for watching TypeScript files and rebuilding on changes
 */
export class WatchService {
  private options: WatchOptions;
  private watcher: chokidar.FSWatcher | null = null;
  private buildPipeline: BuildPipeline;
  private buildTimer: NodeJS.Timeout | null = null;
  private isBuilding = false;
  private pendingBuild = false;
  
  /**
   * Creates a new WatchService instance
   * 
   * @param options Watch options
   */
  constructor(options: WatchOptions) {
    this.options = {
      ...options,
      debounceTime: options.debounceTime || 1000,
      watchSubdirectories: options.watchSubdirectories !== false,
      // Set default options for faster rebuilds
      skipDependencyInstall: options.skipDependencyInstall !== false,
      skipCompilation: options.skipCompilation !== false
    };
    
    this.buildPipeline = new BuildPipeline(this.options);
  }
  
  /**
   * Starts watching for changes
   */
  async start(): Promise<void> {
    const toolsDir = path.resolve(this.options.projectRoot, this.options.toolsDir);
    
    console.log(`🔍 Watching for changes in ${toolsDir}...`);
    
    // Set up signal handlers for graceful shutdown
    this.setupSignalHandlers();
    
    // Run initial build
    try {
      console.log('🔨 Running initial build...');
      const result = await this.buildPipeline.build();
      
      if (result.success) {
        console.log('✅ Initial build completed successfully');
      } else {
        console.error('❌ Initial build failed');
      }
      
      if (this.options.onBuildComplete) {
        this.options.onBuildComplete(result);
      }
    } catch (error) {
      console.error('❌ Initial build failed with an unexpected error:');
      console.error(error instanceof Error ? error.message : String(error));
      
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    // Start watching for changes
    const watchPattern = this.options.watchSubdirectories
      ? path.join(toolsDir, '**', '*.ts')
      : path.join(toolsDir, '*.ts');
    
    this.watcher = chokidar.watch(watchPattern, {
      ignored: /(^|[/\\])\..|node_modules|dist/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });
    
    // Handle file events
    this.watcher
      .on('add', path => this.handleFileChange('add', path))
      .on('change', path => this.handleFileChange('change', path))
      .on('unlink', path => this.handleFileChange('unlink', path));
    
    console.log('👀 Watching for changes (press Ctrl+C to stop)');
  }
  
  /**
   * Stops watching for changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    
    if (this.buildTimer) {
      clearTimeout(this.buildTimer);
      this.buildTimer = null;
    }
    
    console.log('👋 Stopped watching for changes');
  }
  
  /**
   * Handles file changes
   * 
   * @param event File event type
   * @param filePath File path
   */
  private handleFileChange(event: 'add' | 'change' | 'unlink', filePath: string): void {
    const relativePath = path.relative(this.options.projectRoot, filePath);
    console.log(`📝 ${event === 'add' ? 'Added' : event === 'change' ? 'Changed' : 'Removed'}: ${relativePath}`);
    
    // Debounce rebuild
    if (this.buildTimer) {
      clearTimeout(this.buildTimer);
    }
    
    this.buildTimer = setTimeout(() => {
      this.debouncedRebuild();
    }, this.options.debounceTime);
  }
  
  /**
   * Rebuilds the project after debounce
   */
  private async debouncedRebuild(): Promise<void> {
    if (this.isBuilding) {
      // If already building, mark as pending and return
      this.pendingBuild = true;
      return;
    }
    
    this.isBuilding = true;
    this.pendingBuild = false;
    
    try {
      console.log('🔨 Rebuilding...');
      const startTime = Date.now();
      
      const result = await this.buildPipeline.build();
      
      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ Rebuild completed successfully in ${duration}ms`);
      } else {
        console.error(`❌ Rebuild failed after ${duration}ms`);
      }
      
      if (this.options.onBuildComplete) {
        this.options.onBuildComplete(result);
      }
    } catch (error) {
      console.error('❌ Rebuild failed with an unexpected error:');
      console.error(error instanceof Error ? error.message : String(error));
      
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.isBuilding = false;
      
      // If a build was requested while we were building, start another one
      if (this.pendingBuild) {
        this.debouncedRebuild();
      }
    }
  }
  
  /**
   * Sets up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleSignal = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down...`);
      await this.stop();
      process.exit(0);
    };
    
    // Handle Ctrl+C and other termination signals
    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught exception:');
      console.error(error);
      await this.stop();
      process.exit(1);
    });
  }
}

/**
 * Starts watching for changes in the specified directory
 * 
 * @param options Watch options
 * @returns Promise resolving to the watch service
 */
export async function watch(options: WatchOptions): Promise<WatchService> {
  const service = new WatchService(options);
  await service.start();
  return service;
}
