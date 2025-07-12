#!/usr/bin/env node
import { Command } from 'commander';
import { createProject } from './project/create.js';
import { buildFramework } from './framework/build.js';
import {
  initMCPProject,
  buildMCPServer,
  watchMCPServer,
  validateTools,
  createToolTemplate
} from './commands/mcp.js';

const program = new Command();

program
  .name('mcp')
  .description('CLI for managing MCP server projects')
  .version('2.0.0');

// Legacy framework commands
program
  .command('build')
  .description('Build the MCP project')
  .action(buildFramework);

program
  .command('create')
  .description('Create a new MCP server project')
  .argument('[name]', 'project name')
  .option('--http', 'use HTTP transport instead of default stdio')
  .option('--port <number>', 'specify HTTP port (only valid with --http)', (val) =>
    parseInt(val, 10)
  )
  .option('--no-install', 'skip npm install and build steps')
  .action(createProject);

// New TypeScript-to-MCP-Server commands
program
  .command('init-project')
  .description('Initialize MCP project with TypeScript tools support')
  .option('-n, --name <name>', 'project name')
  .option('-t, --transport <type>', 'transport type (stdio|http)', 'stdio')
  .option('-p, --port <port>', 'HTTP port (when using http transport)', '8080')
  .action(async (options) => {
    await initMCPProject({
      name: options.name,
      transport: options.transport,
      port: options.port
    });
  });

program
  .command('mcp-build')
  .description('Build MCP server from TypeScript tools')
  .option('--tools-dir <dir>', 'tools directory', '.idea/mcp/ts/tools')
  .option('--output-dir <dir>', 'output directory', '.idea/mcp/generated')
  .action(async (options) => {
    await buildMCPServer({
      toolsDir: options.toolsDir,
      outputDir: options.outputDir
    });
  });

program
  .command('mcp-watch')
  .description('Watch for changes and rebuild MCP server automatically')
  .option('--tools-dir <dir>', 'tools directory', '.idea/mcp/ts/tools')
  .option('--output-dir <dir>', 'output directory', '.idea/mcp/generated')
  .action(async (options) => {
    await watchMCPServer({
      toolsDir: options.toolsDir,
      outputDir: options.outputDir
    });
  });

program
  .command('validate')
  .description('Validate TypeScript tools without building')
  .option('--tools-dir <dir>', 'tools directory', '.idea/mcp/ts/tools')
  .action(async (options) => {
    await validateTools({
      toolsDir: options.toolsDir
    });
  });

program
  .command('create-tool <name>')
  .description('Create a new TypeScript tool template')
  .option('-t, --type <type>', 'tool type (analysis|action|utility)', 'utility')
  .option('--tools-dir <dir>', 'tools directory', '.idea/mcp/ts/tools')
  .action(async (name, options) => {
    await createToolTemplate(name, {
      type: options.type as 'analysis' | 'action' | 'utility',
      toolsDir: options.toolsDir
    });
  });

program.parse();