import chalk from 'chalk';
import { loadGlobalConfig, loadProjectConfig, validateConfig } from '../../core/config';
import { Daemon } from '../../core/daemon';
import { Logger } from '../../utils/logger';

interface StartOptions {
  interval?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  try {
    // Load configuration
    const globalConfig = loadGlobalConfig();
    const projectConfig = loadProjectConfig();

    if (!projectConfig) {
      console.log(chalk.red('No project configuration found.'));
      console.log(chalk.yellow('Run "jira-claude-bot init" to create a configuration file.'));
      process.exit(1);
    }

    // Validate configuration
    const errors = validateConfig(globalConfig, projectConfig);
    if (errors.length > 0) {
      console.log(chalk.red('Configuration errors:'));
      errors.forEach(e => console.log(chalk.red(`  - ${e}`)));
      process.exit(1);
    }

    // Parse poll interval
    const pollInterval = options.interval ? parseInt(options.interval, 10) : undefined;

    // Show banner
    console.log(chalk.blue(`
     ╦╦╦╔═╗  ╔═╗╦  ╔═╗╦ ╦╔╦╗╔═╗  ╔╗ ╔═╗╔╦╗
     ║║║╠╦╝  ║  ║  ╠═╣║ ║ ║║║╣   ╠╩╗║ ║ ║
    ╚╝╚╝╩╚═  ╚═╝╩═╝╩ ╩╚═╝═╩╝╚═╝  ╚═╝╚═╝ ╩
    `));

    console.log(chalk.gray(`  Project: ${projectConfig.project.jiraKey}`));
    console.log(chalk.gray(`  Repo: ${projectConfig.project.repo}`));
    console.log('');

    // Create and start daemon
    const logger = new Logger(
      (globalConfig.bot.logLevel as any) || 'info'
    );

    const daemon = new Daemon(
      globalConfig,
      projectConfig,
      process.cwd(),
      logger,
      { pollInterval }
    );

    await daemon.start();

  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
