#!/usr/bin/env node
import { Command } from 'commander';
import { discoverTools } from '../../codegen/ToolDiscovery.js';
import { ToolValidator, ValidationSeverity } from '../../codegen/ToolValidator.js';
import { loadConfig } from './config-utils.js';

/**
 * CLI command for validating TypeScript tools
 */
async function validateCommand(): Promise<void> {
  const program = new Command();
  
  program
    .name('mcp-validate')
    .description('Validate tools without building')
    .option('-c, --config <path>', 'path to config file')
    .option('--fix', 'attempt to fix common issues')
    .parse(process.argv);
  
  const options = program.opts();
  
  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Discover tools
    console.log('🔍 Discovering tools...');
    const discoveryResult = await discoverTools({
      projectRoot: config.projectRoot,
      toolsDir: config.toolsDir
    });
    
    if (discoveryResult.errors.length > 0) {
      console.error('❌ Tool discovery failed:');
      discoveryResult.errors.forEach(error => console.error(`  - ${error}`));
    }
    
    if (discoveryResult.tools.length === 0) {
      console.warn('⚠️ No tools found in directory:', config.toolsDir);
      return;
    }
    
    console.log(`✅ Found ${discoveryResult.tools.length} tools`);
    
    // Validate tools
    console.log('🔍 Validating tools...');
    const validator = new ToolValidator();
    const validationResults = await validator.validateTools(discoveryResult.tools);
    
    // Count issues by severity
    const errorCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.ERROR).length, 0);
    
    const warningCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.WARNING).length, 0);
    
    const infoCount = validationResults.reduce((count, result) => 
      count + result.issues.filter(i => i.severity === ValidationSeverity.INFO).length, 0);
    
    // Display validation results
    if (errorCount > 0 || warningCount > 0 || infoCount > 0) {
      console.log(`\nValidation results: ${errorCount} errors, ${warningCount} warnings, ${infoCount} info`);
      
      for (const result of validationResults) {
        if (result.issues.length > 0) {
          console.log(`\nTool: ${result.tool.className} (${result.tool.filePath})`);
          
          // Group issues by severity
          const errors = result.issues.filter(i => i.severity === ValidationSeverity.ERROR);
          const warnings = result.issues.filter(i => i.severity === ValidationSeverity.WARNING);
          const infos = result.issues.filter(i => i.severity === ValidationSeverity.INFO);
          
          if (errors.length > 0) {
            console.log('  Errors:');
            for (const issue of errors) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
          
          if (warnings.length > 0) {
            console.log('  Warnings:');
            for (const issue of warnings) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
          
          if (infos.length > 0) {
            console.log('  Info:');
            for (const issue of infos) {
              console.log(`    - ${issue.message}`);
              if (issue.fix) {
                console.log(`      Fix: ${issue.fix}`);
              }
            }
          }
        }
      }
      
      if (errorCount > 0) {
        console.error('\n❌ Validation failed with errors');
        process.exit(1);
      } else {
        console.log('\n✅ Validation completed with warnings/info');
      }
    } else {
      console.log('✅ All tools validated successfully');
    }
  } catch (error) {
    console.error(`❌ Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the command
validateCommand().catch(error => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
