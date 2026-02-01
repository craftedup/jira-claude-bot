import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadGlobalConfig, loadProjectConfig } from '../../core/config';

export async function statusCommand(): Promise<void> {
  console.log(chalk.blue('\n🤖 JIRA Claude Bot Status\n'));

  // Load configuration
  const globalConfig = loadGlobalConfig();
  const projectConfig = loadProjectConfig();

  // Global config status
  console.log(chalk.white.bold('Global Configuration:'));
  console.log(`  JIRA Host: ${globalConfig.jira.host ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
  console.log(`  JIRA Email: ${globalConfig.jira.email ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
  console.log(`  JIRA Token: ${globalConfig.jira.apiToken ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
  console.log('');

  // Project config status
  console.log(chalk.white.bold('Project Configuration:'));
  if (projectConfig) {
    console.log(`  Project Key: ${chalk.cyan(projectConfig.project.jiraKey)}`);
    console.log(`  Repository: ${chalk.cyan(projectConfig.project.repo)}`);
    console.log(`  Base Branch: ${projectConfig.workflow.pr.baseBranch}`);
    console.log(`  Deployment: ${projectConfig.deployment.platform}`);
    console.log(`  Claude Model: ${projectConfig.claude.model}`);

    if (projectConfig.tickets.statuses) {
      console.log(`  Ticket Statuses: ${projectConfig.tickets.statuses.join(', ')}`);
    }
  } else {
    console.log(chalk.yellow('  No project configuration found in current directory.'));
    console.log(chalk.gray('  Run "jira-claude-bot init" to create one.'));
  }
  console.log('');

  // Check for history/state
  const dataDir = globalConfig.bot.dataDir;
  const historyFile = path.join(dataDir, 'history.json');

  console.log(chalk.white.bold('Recent Activity:'));
  if (fs.existsSync(historyFile)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
      const recent = history.slice(-5).reverse();

      if (recent.length > 0) {
        for (const entry of recent) {
          const status = entry.success ? chalk.green('✓') : chalk.red('✗');
          const time = new Date(entry.timestamp).toLocaleString();
          console.log(`  ${status} ${entry.ticketKey} - ${time}`);
          if (entry.pr) {
            console.log(chalk.gray(`      PR: ${entry.pr}`));
          }
          if (entry.error) {
            console.log(chalk.red(`      Error: ${entry.error}`));
          }
        }
      } else {
        console.log(chalk.gray('  No recent activity.'));
      }
    } catch {
      console.log(chalk.gray('  No recent activity.'));
    }
  } else {
    console.log(chalk.gray('  No recent activity.'));
  }

  console.log('');

  // Bot daemon status (placeholder for future)
  console.log(chalk.white.bold('Bot Status:'));
  console.log(chalk.gray('  Daemon mode not running (not yet implemented).'));
  console.log('');
}
