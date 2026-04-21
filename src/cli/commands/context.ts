import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadGlobalConfig, loadProjectConfig, validateConfig } from '../../core/config';
import { JiraClient } from '../../clients/jira';
import { ClaudeClient } from '../../clients/claude';
import { Logger } from '../../utils/logger';

interface ContextOptions {
  model?: string;
}

export async function contextCommand(ticketKey: string, options: ContextOptions): Promise<void> {
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

    // Only validate JIRA config (we don't need repo/workflow for this)
    if (!globalConfig.jira.host || !globalConfig.jira.email || !globalConfig.jira.apiToken) {
      spinner.fail('JIRA configuration is incomplete');
      console.log(chalk.yellow('Set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.'));
      process.exit(1);
    }

    spinner.succeed('Configuration loaded');

    // Fetch ticket details
    spinner.start(`Fetching ${ticketKey}...`);
    const jira = new JiraClient(globalConfig.jira);
    const ticket = await jira.getTicket(ticketKey);
    const ticketUrl = jira.getTicketUrl(ticketKey);
    spinner.succeed(`Fetched ${ticketKey}: ${ticket.summary}`);

    // Download attachments if any
    if (ticket.attachments.length > 0) {
      spinner.start(`Downloading ${ticket.attachments.length} attachment(s)...`);
      const attachmentsDir = path.join(process.cwd(), '.jira-tickets', ticket.key, 'attachments');
      fs.mkdirSync(attachmentsDir, { recursive: true });

      for (const attachment of ticket.attachments) {
        await jira.downloadAttachment(attachment, attachmentsDir);
      }
      spinner.succeed(`Downloaded ${ticket.attachments.length} attachment(s)`);
    }

    // Start interactive Claude Code session
    console.log(chalk.blue(`\nStarting Claude Code session with ${ticketKey} context...\n`));

    const claudeConfig = { ...projectConfig.claude };
    if (options.model) {
      claudeConfig.model = options.model as any;
    }

    const claude = new ClaudeClient(claudeConfig);
    await claude.startInteractiveSession(ticket, ticketUrl, process.cwd());

  } catch (error) {
    spinner.fail('Error');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
