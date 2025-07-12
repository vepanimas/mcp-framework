#!/usr/bin/env node
import { Command } from 'commander';
import { createProject } from './project/create.js';
import { buildFramework } from './framework/build.js';

const program = new Command();

program
  .name('mcp')
  .description('CLI for managing MCP server projects')
  .version('2.0.0');

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

program.parse();