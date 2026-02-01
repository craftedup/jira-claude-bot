import { JiraClient, JiraTicket } from '../clients/jira';
import { ProjectConfig, GlobalConfig } from './config';
import { Logger } from '../utils/logger';

export class Poller {
  private jira: JiraClient;
  private projectConfig: ProjectConfig;
  private logger: Logger;
  private processedTickets: Set<string> = new Set();

  constructor(
    globalConfig: GlobalConfig,
    projectConfig: ProjectConfig,
    logger: Logger
  ) {
    this.jira = new JiraClient(globalConfig.jira);
    this.projectConfig = projectConfig;
    this.logger = logger;
  }

  async getNextTicket(): Promise<JiraTicket | null> {
    const { jiraKey } = this.projectConfig.project;
    const statuses = this.projectConfig.tickets.statuses || ['To Do'];

    // Build JQL query
    const statusClause = statuses.map(s => `"${s}"`).join(', ');
    const jql = this.projectConfig.tickets.jql ||
      `project = ${jiraKey} AND status IN (${statusClause}) ORDER BY priority DESC, created ASC`;

    this.logger.debug(`Polling with JQL: ${jql}`);

    try {
      const tickets = await this.jira.searchTickets(jql, 10);

      // Filter out tickets we've already processed in this session
      const available = tickets.filter(t => !this.processedTickets.has(t.key));

      if (available.length === 0) {
        return null;
      }

      // Return the first (highest priority) ticket
      return available[0];
    } catch (error) {
      this.logger.error(`Failed to poll JIRA: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  markProcessed(ticketKey: string): void {
    this.processedTickets.add(ticketKey);
  }

  clearProcessed(): void {
    this.processedTickets.clear();
  }

  getProcessedCount(): number {
    return this.processedTickets.size;
  }
}
