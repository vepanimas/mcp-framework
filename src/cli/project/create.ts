import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import prompts from 'prompts';
import { execa } from 'execa';

export async function createProject(
  name?: string,
  options?: { http?: boolean; port?: number; install?: boolean }
) {
  let projectName: string;
  const shouldInstall = options?.install !== false;

  if (!name) {
    const response = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'What is the name of your MCP server project?',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : 'Project name can only contain lowercase letters, numbers, and hyphens',
      },
    ]);

    if (!response.projectName) {
      console.log('Project creation cancelled');
      process.exit(1);
    }

    projectName = response.projectName as string;
  } else {
    projectName = name;
  }

  if (!projectName) {
    throw new Error('Project name is required');
  }

  const projectDir = join(process.cwd(), projectName);
  const srcDir = join(projectDir, 'src');

  try {
    console.log('Creating project structure...');
    await mkdir(projectDir);
    await mkdir(srcDir);

    // Create package.json
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: `MCP server: ${projectName}`,
      type: 'module',
      main: './dist/index.js',
      scripts: {
        build: 'tsc',
        start: 'node dist/index.js',
        dev: 'tsc --watch'
      },
      dependencies: {
        'mcp-framework': 'latest',
        zod: '^3.23.8'
      },
      devDependencies: {
        typescript: '^5.3.3',
        '@types/node': '^20.17.28'
      }
    };

    await writeFile(
      join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create tsconfig.json
    const tsConfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist']
    };

    await writeFile(
      join(projectDir, 'tsconfig.json'),
      JSON.stringify(tsConfig, null, 2)
    );

    // Create main server file
    const transportConfig = options?.http
      ? `{ transport: 'http' as const, port: ${options.port || 8080} }`
      : '{}';

    const serverContent = `import { MCPServer, z } from 'mcp-framework';

const server = new MCPServer({
  name: '${projectName}',
  version: '1.0.0',
  ...${transportConfig}
});

// Example tool - remove or modify as needed
server
  .addTool(
    'hello',
    'Say hello to someone',
    z.object({
      name: z.string().describe('Name of the person to greet')
    }),
    async ({ name }) => ({
      content: [{ type: 'text', text: \`Hello, \${name}! Welcome to ${projectName}.\` }]
    })
  )
  .addTool(
    'add',
    'Add two numbers',
    z.object({
      a: z.number().describe('First number'),
      b: z.number().describe('Second number')
    }),
    async ({ a, b }) => ({
      content: [{ type: 'text', text: \`\${a} + \${b} = \${a + b}\` }]
    })
  );

// Start the server
server.start().catch(console.error);
`;

    await writeFile(join(srcDir, 'index.ts'), serverContent);

    // Create README
    const readmeContent = `# ${projectName}

A Model Context Protocol (MCP) server built with mcp-framework.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Build the project:
   \`\`\`bash
   npm run build
   \`\`\`

3. Run the server:
   \`\`\`bash
   npm start
   \`\`\`

## Development

- \`npm run dev\` - Watch mode for development
- \`npm run build\` - Build the project

## Adding Tools

Edit \`src/index.ts\` to add more tools:

\`\`\`typescript
server
  .addTool(
    'tool-name',
    'Tool description',
    z.object({
      param: z.string().describe('Parameter description')
    }),
    async ({ param }) => ({
      content: [{ type: 'text', text: \`Result: \${param}\` }]
    })
  );
\`\`\`

## Transport

${
  options?.http
    ? `This server uses HTTP transport on port ${options.port || 8080}.`
    : 'This server uses stdio transport (default for Claude Desktop).'
}
`;

    await writeFile(join(projectDir, 'README.md'), readmeContent);

    console.log(`✅ Project ${projectName} created successfully!`);

    if (shouldInstall) {
      console.log('Installing dependencies...');
      await execa('npm', ['install'], {
        cwd: projectDir,
        stdio: 'inherit'
      });

      console.log('Building project...');
      await execa('npm', ['run', 'build'], {
        cwd: projectDir,
        stdio: 'inherit'
      });
    }

    console.log(`
🎉 Your MCP server is ready!

Next steps:
  cd ${projectName}
  ${!shouldInstall ? 'npm install\n  npm run build\n  ' : ''}npm start

The server includes example tools. Edit src/index.ts to customize them.
`);

  } catch (error) {
    console.error('Error creating project:', error);
    process.exit(1);
  }
}