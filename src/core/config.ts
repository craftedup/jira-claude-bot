import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as os from 'os';

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
}

export interface TicketCriteria {
  statuses?: string[];
  types?: string[];
  jql?: string;
  assignee?: string;
}

export interface WorkflowConfig {
  branchPattern: string;
  commitPattern: string;
  pr: {
    baseBranch: string;
    titlePattern: string;
    bodyTemplate: string;
  };
  transitions: {
    onPrCreated?: string;
    onPrMerged?: string;
    onPrFailed?: string;
  };
}

export interface DeploymentConfig {
  platform: 'vercel' | 'netlify' | 'custom' | 'none';
  waitForPreview: boolean;
  previewTimeout: number;
}

export interface ClaudeConfig {
  model: 'sonnet' | 'opus' | 'haiku';
  maxTurns: number;
  instructions?: string;
  skills?: string[];
}

export interface GuardrailConfig {
  requireReview?: string[];
  skip?: string[];
}

export interface ProjectConfig {
  project: {
    jiraKey: string;
    repo: string;
  };
  tickets: TicketCriteria;
  workflow: WorkflowConfig;
  deployment: DeploymentConfig;
  claude: ClaudeConfig;
  guardrails?: GuardrailConfig;
}

export interface GlobalConfig {
  bot: {
    pollInterval: number;
    maxConcurrentWorkers: number;
    logLevel: string;
    dataDir: string;
  };
  notifications?: {
    slack?: {
      webhookUrl: string;
      channel: string;
    };
    events?: string[];
  };
  jira: JiraConfig;
}

const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  bot: {
    pollInterval: 300,
    maxConcurrentWorkers: 1,
    logLevel: 'info',
    dataDir: path.join(os.homedir(), '.jira-claude-bot', 'data'),
  },
  jira: {
    host: process.env.JIRA_HOST || '',
    email: process.env.JIRA_EMAIL || '',
    apiToken: process.env.JIRA_API_TOKEN || '',
  },
};

const DEFAULT_PROJECT_CONFIG: Partial<ProjectConfig> = {
  workflow: {
    branchPattern: 'feature/{ticket_key}',
    commitPattern: '{ticket_key}: {summary}',
    pr: {
      baseBranch: 'develop',
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
      onPrCreated: 'PR to develop open',
    },
  },
  deployment: {
    platform: 'vercel',
    waitForPreview: true,
    previewTimeout: 300,
  },
  claude: {
    model: 'sonnet',
    maxTurns: 50,
  },
};

export function loadGlobalConfig(): GlobalConfig {
  const configPath = path.join(os.homedir(), '.jira-claude-bot', 'config.yaml');

  let config = { ...DEFAULT_GLOBAL_CONFIG };

  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const fileConfig = yaml.load(fileContent) as Partial<GlobalConfig>;
    config = deepMerge(config, fileConfig);
  }

  // Override with environment variables
  if (process.env.JIRA_HOST) config.jira.host = process.env.JIRA_HOST;
  if (process.env.JIRA_EMAIL) config.jira.email = process.env.JIRA_EMAIL;
  if (process.env.JIRA_API_TOKEN) config.jira.apiToken = process.env.JIRA_API_TOKEN;

  return config;
}

export function loadProjectConfig(projectPath: string = process.cwd()): ProjectConfig | null {
  const configPath = path.join(projectPath, '.jira-claude-bot.yaml');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const fileContent = fs.readFileSync(configPath, 'utf8');
  const fileConfig = yaml.load(fileContent) as Partial<ProjectConfig>;

  return deepMerge(DEFAULT_PROJECT_CONFIG, fileConfig) as ProjectConfig;
}

export function saveProjectConfig(config: ProjectConfig, projectPath: string = process.cwd()): void {
  const configPath = path.join(projectPath, '.jira-claude-bot.yaml');
  const yamlContent = yaml.dump(config, { indent: 2, lineWidth: 120 });
  fs.writeFileSync(configPath, yamlContent);
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key])
      ) {
        (result as any)[key] = deepMerge(
          (target as any)[key] || {},
          source[key] as any
        );
      } else {
        (result as any)[key] = source[key];
      }
    }
  }

  return result;
}

export function validateConfig(global: GlobalConfig, project: ProjectConfig | null): string[] {
  const errors: string[] = [];

  // Validate global config
  if (!global.jira.host) errors.push('JIRA_HOST is required');
  if (!global.jira.email) errors.push('JIRA_EMAIL is required');
  if (!global.jira.apiToken) errors.push('JIRA_API_TOKEN is required');

  // Validate project config if present
  if (project) {
    if (!project.project?.jiraKey) errors.push('project.jiraKey is required');
    if (!project.project?.repo) errors.push('project.repo is required');
  }

  return errors;
}
