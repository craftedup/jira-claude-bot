import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { saveProjectConfig, ProjectConfig } from '../../core/config';

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const configPath = path.join(process.cwd(), '.jira-claude-bot.yaml');

  if (fs.existsSync(configPath) && !options.force) {
    console.log(chalk.yellow('Configuration already exists. Use --force to overwrite.'));
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log(chalk.blue('\n🤖 JIRA Claude Bot Setup\n'));

  try {
    // Get project details
    const jiraKey = await question('JIRA project key (e.g., CW2): ');

    // Try to detect repo from git
    let defaultRepo = '';
    try {
      const gitRemote = require('child_process')
        .execSync('git remote get-url origin', { encoding: 'utf8' })
        .trim();
      const match = gitRemote.match(/github\.com[:/](.+?)(?:\.git)?$/);
      if (match) {
        defaultRepo = match[1];
      }
    } catch {
      // Ignore
    }

    const repo = await question(`GitHub repo (${defaultRepo || 'owner/repo'}): `) || defaultRepo;

    // Get workflow details
    const baseBranch = await question('Base branch (develop): ') || 'develop';
    const statusToDo = await question('Status to fetch (To Do): ') || 'To Do';
    const statusOnPr = await question('Status after PR created (PR to develop open): ') || 'PR to develop open';

    // Get deployment platform
    const deployment = await question('Deployment platform (vercel/netlify/none) [vercel]: ') || 'vercel';

    // Create config
    const config: ProjectConfig = {
      project: {
        jiraKey,
        repo,
      },
      tickets: {
        statuses: [statusToDo],
      },
      workflow: {
        branchPattern: 'feature/{ticket_key}',
        commitPattern: '{ticket_key}: {summary}',
        pr: {
          baseBranch,
          titlePattern: '{ticket_key}: {summary}',
          bodyTemplate: `## Jira Ticket
{ticket_url}

## Summary
{changes_summary}

## Testing
{testing_instructions}

🤖 Generated with JIRA Claude Bot`,
        },
        transitions: {
          onPrCreated: statusOnPr,
        },
      },
      deployment: {
        platform: deployment as 'vercel' | 'netlify' | 'none',
        waitForPreview: deployment !== 'none',
        previewTimeout: 300,
      },
      claude: {
        model: 'sonnet',
        maxTurns: 50,
      },
    };

    saveProjectConfig(config);

    console.log(chalk.green('\n✓ Configuration saved to .jira-claude-bot.yaml'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('1. Review and customize .jira-claude-bot.yaml'));
    console.log(chalk.gray('2. Set environment variables: JIRA_HOST, JIRA_EMAIL, JIRA_API_TOKEN'));
    console.log(chalk.gray('3. Run: jira-claude-bot validate'));
    console.log(chalk.gray('4. Run: jira-claude-bot work TICKET-123'));

  } finally {
    rl.close();
  }
}
