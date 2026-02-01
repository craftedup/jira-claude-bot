import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { loadGlobalConfig, loadProjectConfig, validateConfig } from '../../core/config';
import { JiraClient } from '../../clients/jira';

export async function validateCommand(): Promise<void> {
  const spinner = ora();
  let hasErrors = false;

  console.log(chalk.blue('\n🔍 Validating JIRA Claude Bot configuration...\n'));

  // 1. Check configuration files
  spinner.start('Checking configuration...');
  const globalConfig = loadGlobalConfig();
  const projectConfig = loadProjectConfig();

  const configErrors = validateConfig(globalConfig, projectConfig);
  if (configErrors.length > 0) {
    spinner.fail('Configuration errors:');
    configErrors.forEach(e => console.log(chalk.red(`    - ${e}`)));
    hasErrors = true;
  } else {
    spinner.succeed('Configuration valid');
  }

  // 2. Check JIRA connection
  spinner.start('Testing JIRA connection...');
  try {
    const jiraClient = new JiraClient(globalConfig.jira);
    if (projectConfig) {
      await jiraClient.searchTickets(`project = ${projectConfig.project.jiraKey}`, 1);
    }
    spinner.succeed('JIRA connection successful');
  } catch (error) {
    spinner.fail('JIRA connection failed');
    console.log(chalk.red(`    - ${error instanceof Error ? error.message : String(error)}`));
    hasErrors = true;
  }

  // 3. Check GitHub CLI
  spinner.start('Checking GitHub CLI...');
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    spinner.succeed('GitHub CLI authenticated');
  } catch {
    spinner.fail('GitHub CLI not authenticated');
    console.log(chalk.yellow('    Run: gh auth login'));
    hasErrors = true;
  }

  // 4. Check Claude CLI
  spinner.start('Checking Claude CLI...');
  try {
    execSync('claude --version', { stdio: 'pipe' });
    spinner.succeed('Claude CLI available');
  } catch {
    spinner.fail('Claude CLI not found');
    console.log(chalk.yellow('    Install Claude Code CLI: https://claude.ai/cli'));
    hasErrors = true;
  }

  // 5. Check Git
  spinner.start('Checking Git...');
  try {
    execSync('git status', { stdio: 'pipe', cwd: process.cwd() });
    spinner.succeed('Git repository detected');
  } catch {
    spinner.fail('Not a Git repository');
    hasErrors = true;
  }

  // 6. Check deployment CLI (if configured)
  if (projectConfig?.deployment.platform === 'vercel') {
    spinner.start('Checking Vercel CLI...');
    try {
      execSync('npx vercel --version', { stdio: 'pipe' });
      spinner.succeed('Vercel CLI available');
    } catch {
      spinner.warn('Vercel CLI not available (optional)');
    }
  }

  // Summary
  console.log('');
  if (hasErrors) {
    console.log(chalk.red('❌ Validation failed. Please fix the errors above.'));
    process.exit(1);
  } else {
    console.log(chalk.green('✅ All checks passed! Ready to process tickets.'));
    if (projectConfig) {
      console.log(chalk.gray(`\nProject: ${projectConfig.project.jiraKey}`));
      console.log(chalk.gray(`Repository: ${projectConfig.project.repo}`));
      console.log(chalk.gray(`\nRun "jira-claude-bot list-tickets" to see available tickets.`));
    }
  }
}
