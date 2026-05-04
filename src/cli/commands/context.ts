import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadGlobalConfig, loadProjectConfig } from '../../core/config';
import { JiraClient } from '../../clients/jira';
import { ClaudeClient } from '../../clients/claude';

interface ContextOptions {
  model?: string;
  print?: boolean;
  spawn?: boolean;
}

function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function contextCommand(ticketKey: string, options: ContextOptions): Promise<void> {
  const spinner = ora();

  // commander turns --no-spawn into options.spawn === false
  const noSpawnRequested = options.spawn === false;
  const printRequested = options.print === true || noSpawnRequested;
  const interactive = isInteractiveTty();

  try {
    spinner.start('Loading configuration...');
    const globalConfig = loadGlobalConfig();
    const projectConfig = loadProjectConfig();

    if (!projectConfig) {
      spinner.fail('No project configuration found');
      console.log(chalk.yellow('Run "jira-claude-bot init" to create a configuration file.'));
      process.exit(1);
    }

    if (!globalConfig.jira.host || !globalConfig.jira.email || !globalConfig.jira.apiToken) {
      spinner.fail('JIRA configuration is incomplete');
      console.log(chalk.yellow('Set JIRA_HOST, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.'));
      process.exit(1);
    }

    spinner.succeed('Configuration loaded');

    spinner.start(`Fetching ${ticketKey}...`);
    const jira = new JiraClient(globalConfig.jira);
    const ticket = await jira.getTicket(ticketKey);
    const ticketUrl = jira.getTicketUrl(ticketKey);
    spinner.succeed(`Fetched ${ticketKey}: ${ticket.summary}`);

    const ticketDir = path.join(process.cwd(), '.jira-tickets', ticket.key);
    fs.mkdirSync(ticketDir, { recursive: true });

    if (ticket.attachments.length > 0) {
      spinner.start(`Downloading ${ticket.attachments.length} attachment(s)...`);
      const attachmentsDir = path.join(ticketDir, 'attachments');
      fs.mkdirSync(attachmentsDir, { recursive: true });

      for (const attachment of ticket.attachments) {
        await jira.downloadAttachment(attachment, attachmentsDir);
      }
      spinner.succeed(`Downloaded ${ticket.attachments.length} attachment(s)`);
    }

    const claudeConfig = { ...projectConfig.claude };
    if (options.model) {
      claudeConfig.model = options.model as any;
    }

    const claude = new ClaudeClient(claudeConfig);
    const prompt = claude.buildContextPromptPublic(ticket, ticketUrl);

    const ticketFile = path.join(ticketDir, 'ticket.md');
    fs.writeFileSync(ticketFile, prompt + '\n');
    const relTicketFile = path.relative(process.cwd(), ticketFile);
    console.log(chalk.green(`Wrote ticket context to ${relTicketFile}`));

    if (printRequested) {
      process.stdout.write(prompt + '\n');
      return;
    }

    if (!interactive) {
      console.log(
        chalk.yellow(
          'Non-TTY environment detected — skipping interactive Claude Code session.'
        )
      );
      console.log(
        chalk.gray(
          `Read the ticket from ${relTicketFile}, or re-run with --print to emit the prompt to stdout.`
        )
      );
      return;
    }

    console.log(chalk.blue(`\nStarting Claude Code session with ${ticketKey} context...\n`));
    await claude.startInteractiveSession(ticket, ticketUrl, process.cwd(), undefined, prompt);
  } catch (error) {
    spinner.fail('Error');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
