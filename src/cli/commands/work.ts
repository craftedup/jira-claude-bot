import chalk from 'chalk';
import ora from 'ora';
import { loadGlobalConfig, loadProjectConfig, validateConfig } from '../../core/config';
import { Worker } from '../../core/worker';
import { Logger } from '../../utils/logger';

interface WorkOptions {
  dryRun?: boolean;
}

export async function workCommand(ticketKey: string, options: WorkOptions): Promise<void> {
  const spinner = ora();

  try {
    // Load configuration
    spinner.start('Loading configuration...');
    const globalConfig = loadGlobalConfig();
    const projectConfig = loadProjectConfig();

    if (!projectConfig) {
      spinner.fail('No project configuration found');
      console.log(chalk.yellow('Run "jira-claude-bot init" to create a configuration file.'));
      process.exit(1);
    }

    // Validate configuration
    const errors = validateConfig(globalConfig, projectConfig);
    if (errors.length > 0) {
      spinner.fail('Configuration errors:');
      errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
      process.exit(1);
    }

    spinner.succeed('Configuration loaded');

    if (options.dryRun) {
      console.log(chalk.yellow('\n📋 Dry run mode - showing what would be done:\n'));
      console.log(`  Ticket: ${ticketKey}`);
      console.log(`  Branch: feature/${ticketKey}`);
      console.log(`  Base: ${projectConfig.workflow.pr.baseBranch}`);
      console.log(`  Transition: ${projectConfig.workflow.transitions.onPrCreated || 'None'}`);
      console.log(`  Deployment: ${projectConfig.deployment.platform}`);
      return;
    }

    // Create worker and process ticket
    const logger = new Logger('info', ticketKey);
    const worker = new Worker(
      globalConfig,
      projectConfig,
      process.cwd(),
      logger
    );

    console.log(chalk.blue(`\n🤖 Working on ${ticketKey}...\n`));

    const result = await worker.processTicket(ticketKey);

    if (result.success) {
      console.log(chalk.green(`\n✓ Successfully completed ${ticketKey}`));
      if (result.pr) {
        console.log(chalk.gray(`  PR: ${result.pr.url}`));
      }
      if (result.previewUrl) {
        console.log(chalk.gray(`  Preview: ${result.previewUrl}`));
      }
    } else {
      console.log(chalk.red(`\n✗ Failed to process ${ticketKey}`));
      console.log(chalk.red(`  Error: ${result.error}`));
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Error');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
