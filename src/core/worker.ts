import * as fs from 'fs';
import * as path from 'path';
import { JiraClient, JiraTicket } from '../clients/jira';
import { GitHubClient, PullRequest } from '../clients/github';
import { ClaudeClient } from '../clients/claude';
import { ProjectConfig, GlobalConfig } from './config';
import { Logger } from '../utils/logger';

export interface WorkResult {
  success: boolean;
  ticketKey: string;
  pr?: PullRequest;
  previewUrl?: string;
  error?: string;
  changesSummary?: string;
}

export class Worker {
  private jira: JiraClient;
  private github: GitHubClient;
  private claude: ClaudeClient;
  private projectConfig: ProjectConfig;
  private globalConfig: GlobalConfig;
  private logger: Logger;
  private workingDir: string;

  constructor(
    globalConfig: GlobalConfig,
    projectConfig: ProjectConfig,
    workingDir: string,
    logger: Logger
  ) {
    this.globalConfig = globalConfig;
    this.projectConfig = projectConfig;
    this.workingDir = workingDir;
    this.logger = logger;

    this.jira = new JiraClient(globalConfig.jira);
    this.github = new GitHubClient(projectConfig.project.repo);
    this.claude = new ClaudeClient(projectConfig.claude);
  }

  async processTicket(ticketKey: string): Promise<WorkResult> {
    this.logger.info(`Starting work on ${ticketKey}`);

    try {
      // 1. Fetch ticket details
      this.logger.info(`Fetching ticket details...`);
      const ticket = await this.jira.getTicket(ticketKey);
      const ticketUrl = this.jira.getTicketUrl(ticketKey);

      // 2. Download attachments
      if (ticket.attachments.length > 0) {
        await this.downloadAttachments(ticket);
      }

      // 3. Create feature branch
      const branchName = this.formatPattern(
        this.projectConfig.workflow.branchPattern,
        ticket
      );
      this.logger.info(`Creating branch: ${branchName}`);
      await this.github.createBranch(
        branchName,
        this.projectConfig.workflow.pr.baseBranch
      );

      // 4. Run Claude Code to implement the ticket
      this.logger.info(`Running Claude Code...`);
      const claudeResult = await this.claude.workTicket(
        ticket,
        ticketUrl,
        this.workingDir
      );

      this.logger.info(`Claude Code finished. Success: ${claudeResult.success}`);
      if (claudeResult.error) {
        this.logger.error(`Claude error: ${claudeResult.error}`);
      }

      if (!claudeResult.success) {
        throw new Error(`Claude Code failed: ${claudeResult.error}`);
      }

      // 5. Check if there are changes (committed or uncommitted)
      this.logger.info(`Checking for changes...`);
      const status = await this.github.getStatus();
      const hasUncommitted = status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;
      const hasNewCommits = await this.github.hasNewCommits(this.projectConfig.workflow.pr.baseBranch);

      this.logger.info(`Git status - uncommitted: ${hasUncommitted}, new commits: ${hasNewCommits}`);

      if (!hasUncommitted && !hasNewCommits) {
        this.logger.warn(`No changes made by Claude Code`);
        return {
          success: false,
          ticketKey,
          error: 'No changes were made',
        };
      }

      // If there are uncommitted changes, commit them
      if (hasUncommitted) {
        this.logger.info(`Committing uncommitted changes...`);
        await this.github.commitChanges(`${ticketKey}: Implementation`);
      }

      // 6. Push branch
      this.logger.info(`Pushing branch...`);
      await this.github.pushBranch(branchName);

      // 7. Create PR
      const prTitle = this.formatPattern(
        this.projectConfig.workflow.pr.titlePattern,
        ticket
      );
      // Get summary from git commits since Claude output isn't captured
      const changesSummary = await this.github.getCommitSummary(this.projectConfig.workflow.pr.baseBranch);
      const prBody = this.formatPrBody(ticket, ticketUrl, changesSummary);

      this.logger.info(`Creating PR...`);
      const pr = await this.github.createPullRequest(
        prTitle,
        prBody,
        this.projectConfig.workflow.pr.baseBranch
      );

      // 8. Wait for deployment preview
      let previewUrl: string | undefined;
      if (this.projectConfig.deployment.waitForPreview) {
        this.logger.info(`Waiting for preview deployment...`);
        const url = await this.github.getDeploymentUrl(
          pr.number,
          Math.ceil(this.projectConfig.deployment.previewTimeout / 5)
        );
        if (url) {
          previewUrl = url;
          this.logger.info(`Preview URL: ${previewUrl}`);
        }
      }

      // 9. Update JIRA
      this.logger.info(`Updating JIRA ticket...`);
      const comment = this.formatJiraComment(pr, previewUrl, changesSummary);
      await this.jira.addComment(ticketKey, comment);

      // 10. Transition ticket
      if (this.projectConfig.workflow.transitions.onPrCreated) {
        this.logger.info(`Transitioning ticket to "${this.projectConfig.workflow.transitions.onPrCreated}"...`);
        await this.jira.transitionTicket(
          ticketKey,
          this.projectConfig.workflow.transitions.onPrCreated
        );
      }

      // 11. Return to base branch
      await this.github.checkoutBranch(this.projectConfig.workflow.pr.baseBranch);

      this.logger.info(`Successfully completed ${ticketKey}`);
      return {
        success: true,
        ticketKey,
        pr,
        previewUrl,
        changesSummary,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process ${ticketKey}: ${errorMessage}`);

      // Try to return to base branch
      try {
        await this.github.checkoutBranch(this.projectConfig.workflow.pr.baseBranch);
      } catch {
        // Ignore
      }

      return {
        success: false,
        ticketKey,
        error: errorMessage,
      };
    }
  }

  private async downloadAttachments(ticket: JiraTicket): Promise<void> {
    const attachmentsDir = path.join(
      this.workingDir,
      '.jira-tickets',
      ticket.key,
      'attachments'
    );

    fs.mkdirSync(attachmentsDir, { recursive: true });

    for (const attachment of ticket.attachments) {
      this.logger.info(`Downloading attachment: ${attachment.filename}`);
      await this.jira.downloadAttachment(attachment, attachmentsDir);
    }
  }

  private formatPattern(pattern: string, ticket: JiraTicket): string {
    return pattern
      .replace(/{ticket_key}/g, ticket.key)
      .replace(/{summary}/g, this.sanitizeForBranch(ticket.summary))
      .replace(/{type}/g, ticket.type.toLowerCase());
  }

  private sanitizeForBranch(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }

  private formatPrBody(ticket: JiraTicket, ticketUrl: string, changesSummary: string): string {
    return this.projectConfig.workflow.pr.bodyTemplate
      .replace(/{ticket_key}/g, ticket.key)
      .replace(/{ticket_url}/g, ticketUrl)
      .replace(/{summary}/g, ticket.summary)
      .replace(/{changes_summary}/g, changesSummary || '- Implementation details in commits')
      .replace(/{testing_instructions}/g, '- Review the changes\n- Test on preview deployment');
  }

  private formatJiraComment(pr: PullRequest, previewUrl?: string, changesSummary?: string): string {
    let comment = `PR: ${pr.url}`;

    if (previewUrl) {
      comment += `\nPreview: ${previewUrl}`;
    }

    if (changesSummary) {
      comment += `\n\nChanges made:\n${changesSummary}`;
    }

    comment += '\n\nReady for review.';

    return comment;
  }

  private extractChangesSummary(claudeOutput: string): string {
    // Try to extract a summary from Claude's output
    // Look for patterns like "Changes made:", "Summary:", etc.
    const patterns = [
      /Changes made:?\s*\n((?:[-*]\s+.+\n?)+)/i,
      /Summary:?\s*\n((?:[-*]\s+.+\n?)+)/i,
      /I (?:made|implemented|added|fixed|updated)(.+?)(?:\n\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = claudeOutput.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // If no summary found, return a generic message
    return '- See commit messages for details';
  }
}
