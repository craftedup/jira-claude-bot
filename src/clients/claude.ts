import { spawn, ChildProcess } from 'child_process';
import { ClaudeConfig } from '../core/config';
import { JiraTicket } from './jira';

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
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      // Stream output in real-time while also capturing it
      childProcess.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
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
            output: stdout,
          });
        } else {
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Claude exited with code ${code}`,
          });
        }
      });

      childProcess.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          output: stdout,
          error: err.message,
        });
      });
    });
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
${this.formatDescription(ticket.description)}

`;

    if (ticket.attachments.length > 0) {
      prompt += `## Attachments
${ticket.attachments.map(a => `- ${a.filename}`).join('\n')}

Please review any image attachments in the .jira-tickets/${ticket.key}/attachments/ folder.

`;
    }

    if (ticket.comments.length > 0) {
      prompt += `## Recent Comments
${ticket.comments.slice(-3).map(c => `**${c.author}**: ${this.formatDescription(c.body)}`).join('\n\n')}

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
1. Understand the requirements from the ticket
2. Make the necessary code changes
3. Ensure TypeScript/lint checks pass
4. Commit your changes with message: "${ticket.key}: [brief description]"

Do not create a PR - that will be handled separately.
`;

    return prompt;
  }

  private formatDescription(description: any): string {
    if (!description) return 'No description provided.';

    if (typeof description === 'string') {
      return description;
    }

    // Handle Atlassian Document Format
    if (description.type === 'doc' && description.content) {
      return this.adfToText(description.content);
    }

    return JSON.stringify(description, null, 2);
  }

  private adfToText(content: any[]): string {
    let text = '';

    for (const node of content) {
      switch (node.type) {
        case 'paragraph':
          text += this.adfToText(node.content || []) + '\n\n';
          break;
        case 'text':
          text += node.text || '';
          break;
        case 'bulletList':
          for (const item of node.content || []) {
            text += '- ' + this.adfToText(item.content || []).trim() + '\n';
          }
          text += '\n';
          break;
        case 'orderedList':
          let num = 1;
          for (const item of node.content || []) {
            text += `${num}. ` + this.adfToText(item.content || []).trim() + '\n';
            num++;
          }
          text += '\n';
          break;
        case 'listItem':
          text += this.adfToText(node.content || []);
          break;
        case 'heading':
          const level = node.attrs?.level || 1;
          text += '#'.repeat(level) + ' ' + this.adfToText(node.content || []) + '\n\n';
          break;
        case 'codeBlock':
          text += '```\n' + (node.content?.[0]?.text || '') + '\n```\n\n';
          break;
        case 'hardBreak':
          text += '\n';
          break;
        default:
          if (node.content) {
            text += this.adfToText(node.content);
          }
      }
    }

    return text;
  }
}
