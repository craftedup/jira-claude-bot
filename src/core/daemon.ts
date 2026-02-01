import { Poller } from './poller';
import { Worker } from './worker';
import { ProjectConfig, GlobalConfig } from './config';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// Get version from package.json
function getVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export interface DaemonOptions {
  pollInterval: number;  // seconds
}

export class Daemon {
  private poller: Poller;
  private globalConfig: GlobalConfig;
  private projectConfig: ProjectConfig;
  private workingDir: string;
  private logger: Logger;
  private options: DaemonOptions;
  private running: boolean = false;
  private currentTicket: string | null = null;

  constructor(
    globalConfig: GlobalConfig,
    projectConfig: ProjectConfig,
    workingDir: string,
    logger: Logger,
    options: Partial<DaemonOptions> = {}
  ) {
    this.globalConfig = globalConfig;
    this.projectConfig = projectConfig;
    this.workingDir = workingDir;
    this.logger = logger;
    this.options = {
      pollInterval: options.pollInterval || globalConfig.bot.pollInterval || 300,
    };

    this.poller = new Poller(globalConfig, projectConfig, logger);
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.info(`jira-claude-bot v${getVersion()}`);
    this.logger.info(`Daemon started for project ${this.projectConfig.project.jiraKey}`);
    this.logger.info(`Poll interval: ${this.options.pollInterval} seconds`);
    this.logger.info(`Watching statuses: ${this.projectConfig.tickets.statuses?.join(', ') || 'To Do'}`);
    this.logger.info('');
    this.logger.info('Press Ctrl+C to stop');
    this.logger.info('');

    // Set up graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // Main loop
    while (this.running) {
      await this.poll();

      if (this.running) {
        this.logger.debug(`Sleeping for ${this.options.pollInterval} seconds...`);
        await this.sleep(this.options.pollInterval * 1000);
      }
    }

    this.logger.info('Daemon stopped');
  }

  stop(): void {
    this.logger.info('');
    if (this.currentTicket) {
      this.logger.warn(`Stopping... (currently working on ${this.currentTicket})`);
    } else {
      this.logger.info('Stopping daemon...');
    }
    this.running = false;
  }

  private async poll(): Promise<void> {
    this.logger.info('Checking for tickets...');

    const ticket = await this.poller.getNextTicket();

    if (!ticket) {
      this.logger.info('No tickets to process');
      return;
    }

    this.logger.info(`Found ticket: ${ticket.key} - ${ticket.summary}`);
    this.currentTicket = ticket.key;

    // Create a worker and process the ticket
    const worker = new Worker(
      this.globalConfig,
      this.projectConfig,
      this.workingDir,
      this.logger.child(ticket.key)
    );

    const result = await worker.processTicket(ticket.key);

    // Mark as processed regardless of success/failure
    // (we don't want to retry immediately)
    this.poller.markProcessed(ticket.key);
    this.currentTicket = null;

    if (result.success) {
      this.logger.success(`Completed ${ticket.key}`);
      if (result.pr) {
        this.logger.info(`  PR: ${result.pr.url}`);
      }
      if (result.previewUrl) {
        this.logger.info(`  Preview: ${result.previewUrl}`);
      }
    } else {
      this.logger.error(`Failed ${ticket.key}: ${result.error}`);
    }

    this.logger.info('');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);

      // Allow interrupt during sleep
      const checkRunning = setInterval(() => {
        if (!this.running) {
          clearTimeout(timeout);
          clearInterval(checkRunning);
          resolve();
        }
      }, 100);
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getCurrentTicket(): string | null {
    return this.currentTicket;
  }
}
