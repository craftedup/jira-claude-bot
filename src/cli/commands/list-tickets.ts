import chalk from 'chalk';
import ora from 'ora';
import { loadGlobalConfig, loadProjectConfig, validateConfig } from '../../core/config';
import { JiraClient } from '../../clients/jira';

interface ListTicketsOptions {
  status?: string;
  jql?: string;
}

export async function listTicketsCommand(options: ListTicketsOptions): Promise<void> {
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

    // Build JQL query
    let jql: string;
    if (options.jql) {
      jql = options.jql;
    } else {
      const projectKey = projectConfig.project.jiraKey;
      const statuses = options.status
        ? [options.status]
        : projectConfig.tickets.statuses || ['To Do'];

      const statusClause = statuses.map(s => `"${s}"`).join(', ');
      jql = `project = ${projectKey} AND status IN (${statusClause}) ORDER BY priority DESC, created ASC`;
    }

    spinner.start('Fetching tickets...');

    const jiraClient = new JiraClient(globalConfig.jira);
    const tickets = await jiraClient.searchTickets(jql);

    spinner.succeed(`Found ${tickets.length} ticket(s)`);

    if (tickets.length === 0) {
      console.log(chalk.gray('\nNo tickets match the criteria.'));
      return;
    }

    console.log('');

    // Display tickets in a table format
    const maxKeyLen = Math.max(...tickets.map(t => t.key.length));
    const maxSummaryLen = 60;

    for (const ticket of tickets) {
      const key = ticket.key.padEnd(maxKeyLen);
      const priority = getPriorityEmoji(ticket.priority);
      const summary = ticket.summary.length > maxSummaryLen
        ? ticket.summary.substring(0, maxSummaryLen - 3) + '...'
        : ticket.summary;
      const status = chalk.gray(`[${ticket.status}]`);

      console.log(`  ${priority} ${chalk.cyan(key)}  ${summary} ${status}`);
    }

    console.log('');
    console.log(chalk.gray(`Run "jira-claude-bot work <ticket>" to process a ticket.`));

  } catch (error) {
    spinner.fail('Error');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

function getPriorityEmoji(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'highest':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🟢';
    case 'lowest':
      return '⚪';
    default:
      return '⚪';
  }
}
