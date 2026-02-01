#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { workCommand } from './commands/work';
import { listTicketsCommand } from './commands/list-tickets';
import { validateCommand } from './commands/validate';
import { statusCommand } from './commands/status';

const program = new Command();

program
  .name('jira-claude-bot')
  .description('Automated JIRA ticket processing with Claude Code')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize jira-claude-bot in the current project')
  .option('-f, --force', 'Overwrite existing configuration')
  .action(initCommand);

program
  .command('work <ticket>')
  .description('Process a single JIRA ticket')
  .option('-d, --dry-run', 'Show what would be done without making changes')
  .action(workCommand);

program
  .command('list-tickets')
  .alias('ls')
  .description('List tickets that match the configured criteria')
  .option('-s, --status <status>', 'Filter by status')
  .option('-j, --jql <jql>', 'Custom JQL query')
  .action(listTicketsCommand);

program
  .command('validate')
  .description('Validate configuration')
  .action(validateCommand);

program
  .command('status')
  .description('Show bot status and recent activity')
  .action(statusCommand);

// Future commands (not yet implemented)
program
  .command('start')
  .description('Start the bot in daemon mode')
  .option('--detach', 'Run in background')
  .action(() => {
    console.log('Bot daemon mode not yet implemented. Use "work <ticket>" for now.');
  });

program
  .command('stop')
  .description('Stop the bot daemon')
  .action(() => {
    console.log('Bot daemon mode not yet implemented.');
  });

program
  .command('queue')
  .description('Show the ticket queue')
  .action(() => {
    console.log('Queue management not yet implemented.');
  });

program.parse();
