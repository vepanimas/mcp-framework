#!/usr/bin/env node
import { Command } from 'commander';
import { watch, WatchOptions } from '../../codegen/WatchService.js';
import { loadConfig } from './config-utils.js';

/**
 * CLI command for watching TypeScript files and rebuilding automatically
 */
async function watchCommand(): Promise<void> {
  const program = new Command();

  program
    .name('mcp-watch')
    .description('Watch for changes and rebuild automatically')
    .option('-c, --config <path>', 'path to config file')
    .option('-t, --transport <transport>', 'transport type (stdio or http)', 'stdio')
    .option('-p, --port <port>', 'HTTP port (only valid with --http)', (val) => parseInt(val, 10))
    .option(
      '-d, --debounce <ms>',
      'debounce time in milliseconds',
      (val) => parseInt(val, 10),
      1000
    )
    .parse(process.argv);

  const options = program.opts();

  try {
    // Load config
    const config = await loadConfig(options.config);

    // Override config with command line options

    if (options.transport) {
      config.transport = options.transport === 'http' ? 'http' : 'stdio';
    }

    if (options.port && config.transport === 'http') {
      config.port = options.port;
    }

    // Create watch options
    const watchOptions: WatchOptions = {
      ...config,
      debounceTime: options.debounce || 1000,
      // Skip dependency installation for faster rebuilds
      skipDependencyInstall: true,
      skipCompilation: false,
    };

    // Start watching
    await watch(watchOptions);
  } catch (error) {
    console.error(`❌ Watch failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the command
watchCommand().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
