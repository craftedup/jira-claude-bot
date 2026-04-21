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

    // Try to detect host + repo from git remote
    let detectedHost: 'github' | 'bitbucket' | '' = '';
    let defaultRepo = '';
    try {
      const gitRemote = require('child_process')
        .execSync('git remote get-url origin', { encoding: 'utf8' })
        .trim();
      const ghMatch = gitRemote.match(/github\.com[:/](.+?)(?:\.git)?$/);
      const bbMatch = gitRemote.match(/bitbucket\.org[:/](.+?)(?:\.git)?$/);
      if (ghMatch) {
        detectedHost = 'github';
        defaultRepo = ghMatch[1];
      } else if (bbMatch) {
        detectedHost = 'bitbucket';
        defaultRepo = bbMatch[1];
      }
    } catch {
      // Ignore
    }

    const hostAnswer = (await question(
      `Git host (github/bitbucket)${detectedHost ? ` [${detectedHost}]` : ''}: `
    )).trim().toLowerCase() || detectedHost;
    const host: 'github' | 'bitbucket' = hostAnswer === 'bitbucket' ? 'bitbucket' : 'github';

    const repoLabel = host === 'bitbucket' ? 'workspace/repo-slug' : 'owner/repo';
    const repo = (await question(
      `Repo in "${repoLabel}" form (not a URL)${defaultRepo ? ` [${defaultRepo}]` : ''}: `
    )).trim() || defaultRepo;

    // Get workflow details
    const baseBranch = await question('Base branch (develop): ') || 'develop';
    const statusToDo = await question('Status to fetch (To Do): ') || 'To Do';
    const labelsInput = (await question('Label(s) to filter tickets by, comma-separated (leave blank for none): ')).trim();
    const labels = labelsInput ? labelsInput.split(',').map(l => l.trim()).filter(Boolean) : undefined;
    const transitionPrompt = host === 'bitbucket'
      ? 'Status after branch pushed (In Progress): '
      : 'Status after PR created (PR to develop open): ';
    const transitionDefault = host === 'bitbucket' ? 'In Progress' : 'PR to develop open';
    const statusOnPr = await question(transitionPrompt) || transitionDefault;

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
        ...(labels ? { labels } : {}),
      },
      workflow: {
        branchPattern: 'feature/{ticket_key}',
        commitPattern: '{ticket_key}: {summary}',
        skipPullRequest: host === 'bitbucket',
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
