#!/usr/bin/env node
import { execa } from 'execa';
import { findUp } from 'find-up';
import { dirname } from 'path';

export async function buildFramework() {
  console.log('Building MCP project...');

  try {
    const pkgPath = await findUp('package.json');
    if (!pkgPath) {
      throw new Error('Could not find package.json in current directory or any parent directories');
    }

    const projectRoot = dirname(pkgPath);
    console.log(`Building project in: ${projectRoot}`);

    // Simply run TypeScript compiler
    await execa('npx', ['tsc'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    console.log('✅ Build complete!');
  } catch (error: any) {
    console.error(`❌ Build failed: ${error.message}`);
    process.exit(1);
  }
}