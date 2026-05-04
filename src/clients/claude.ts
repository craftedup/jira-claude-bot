import { spawn, ChildProcess } from 'child_process';
import { ClaudeConfig } from '../core/config';
import { JiraTicket } from './jira';
import { formatDescription } from './adf';

export interface ClaudeResult {
  success: boolean;
  output: string;
  error?: string;
}

// Default timeout: 30 minutes (configure via claude.timeout in yaml, value in ms)
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class ClaudeClient {
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  async workTicket(
    ticket: JiraTicket,
    ticketUrl: string,
    workingDir: string,
    additionalContext?: string
  ): Promise<ClaudeResult> {
    const prompt = this.buildPrompt(ticket, ticketUrl, additionalContext);

    return this.runClaude(prompt, workingDir);
  }

  buildContextPromptPublic(
    ticket: JiraTicket,
    ticketUrl: string,
    additionalContext?: string
  ): string {
    return this.buildContextPrompt(ticket, ticketUrl, additionalContext);
  }

  async startInteractiveSession(
    ticket: JiraTicket,
    ticketUrl: string,
    workingDir: string,
    additionalContext?: string,
    prebuiltPrompt?: string
  ): Promise<ClaudeResult> {
    const prompt = prebuiltPrompt ?? this.buildContextPrompt(ticket, ticketUrl, additionalContext);

    return new Promise((resolve) => {
      const args: string[] = [];

      if (this.config.model) {
        args.push('--model', this.config.model);
      }

      args.push('--append-system-prompt', prompt);

      const childProcess = spawn('claude', args, {
        cwd: workingDir,
        stdio: 'inherit',
        env: { ...process.env },
      });

      childProcess.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          output: code === 0 ? 'Session ended' : '',
          error: code !== 0 ? `Claude exited with code ${code}` : undefined,
        });
      });

      childProcess.on('error', (err: Error) => {
        resolve({
          success: false,
          output: '',
          error: err.message,
        });
      });
    });
  }

  async runClaude(prompt: string, workingDir: string): Promise<ClaudeResult> {
    return new Promise((resolve) => {
      const args = ['--print', '--dangerously-skip-permissions'];

      if (this.config.model) {
        args.push('--model', this.config.model);
      }

      if (this.config.maxTurns) {
        args.push('--max-turns', this.config.maxTurns.toString());
      }

      args.push(prompt);

      const childProcess = spawn('claude', args, {
        cwd: workingDir,
        stdio: 'inherit',  // Let Claude use the terminal directly
        env: { ...process.env },
      });

      // Set up timeout
      const timeoutMs = this.config.timeout || DEFAULT_TIMEOUT_MS;
      const timeoutDisplay = timeoutMs >= 60000
        ? `${Math.round(timeoutMs / 1000 / 60)} minutes`
        : `${Math.round(timeoutMs / 1000)} seconds`;
      const timeout = setTimeout(() => {
        console.error(`\n\nClaude Code timed out after ${timeoutDisplay}. Killing process...`);
        childProcess.kill('SIGTERM');
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);
      }, timeoutMs);

      childProcess.on('close', (code: number | null) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({
            success: true,
            output: 'Claude completed successfully',
          });
        } else {
          resolve({
            success: false,
            output: '',
            error: `Claude exited with code ${code}`,
          });
        }
      });

      childProcess.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: '',
          error: err.message,
        });
      });
    });
  }

  private buildContextPrompt(ticket: JiraTicket, ticketUrl: string, additionalContext?: string): string {
    let prompt = `You have context from JIRA ticket ${ticket.key}: ${ticket.summary}

## Ticket Details
- **Key**: ${ticket.key}
- **Type**: ${ticket.type}
- **Priority**: ${ticket.priority}
- **Status**: ${ticket.status}
- **URL**: ${ticketUrl}

## Description
${this.formatDescription(ticket.description, ticket.key)}

`;

    if (ticket.attachments.length > 0) {
      prompt += `## Attachments
${ticket.attachments.map(a => `- ${a.filename}`).join('\n')}

Please review any image attachments in the .jira-tickets/${ticket.key}/attachments/ folder.

`;
    }

    if (ticket.comments.length > 0) {
      prompt += `## Recent Comments
${ticket.comments.slice(-5).map(c => `**${c.author}** (${c.created}):\n${this.formatDescription(c.body, ticket.key)}`).join('\n\n')}

`;
    }

    if (this.config.instructions) {
      prompt += `## Project Instructions
${this.config.instructions}

`;
    }

    if (additionalContext) {
      prompt += `## Additional Context
${additionalContext}

`;
    }

    prompt += `Use this ticket context to assist with any questions or tasks. The user will guide what to work on.`;

    return prompt;
  }

  private buildPrompt(ticket: JiraTicket, ticketUrl: string, additionalContext?: string): string {
    let prompt = `Work on JIRA ticket ${ticket.key}: ${ticket.summary}

## Ticket Details
- **Key**: ${ticket.key}
- **Type**: ${ticket.type}
- **Priority**: ${ticket.priority}
- **Status**: ${ticket.status}
- **URL**: ${ticketUrl}

## Description
${this.formatDescription(ticket.description, ticket.key)}

`;

    if (ticket.attachments.length > 0) {
      prompt += `## Attachments
${ticket.attachments.map(a => `- ${a.filename}`).join('\n')}

Please review any image attachments in the .jira-tickets/${ticket.key}/attachments/ folder.

`;
    }

    if (ticket.comments.length > 0) {
      prompt += `## Recent Comments
${ticket.comments.slice(-5).map(c => `**${c.author}** (${c.created}):\n${this.formatDescription(c.body, ticket.key)}`).join('\n\n')}

`;
    }

    if (this.config.instructions) {
      prompt += `## Project Instructions
${this.config.instructions}

`;
    }

    if (additionalContext) {
      prompt += `## Additional Context
${additionalContext}

`;
    }

    prompt += `## Task
1. Understand the requirements from the ticket description and any recent comments
2. Make the necessary code changes
3. Ensure TypeScript/lint checks pass
4. Commit your changes with message: "${ticket.key}: [brief description]"

Do not create a PR - that will be handled separately.
`;

    return prompt;
  }

  private formatDescription(description: any, ticketKey?: string): string {
    return formatDescription(description, { ticketKey });
  }
}
