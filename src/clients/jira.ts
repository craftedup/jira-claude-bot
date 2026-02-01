import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { JiraConfig } from '../core/config';

export interface JiraTicket {
  key: string;
  summary: string;
  description: any;
  status: string;
  type: string;
  priority: string;
  assignee: string | null;
  reporter: string;
  attachments: JiraAttachment[];
  comments: JiraComment[];
  labels: string[];
  customFields: Record<string, any>;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
}

export interface JiraComment {
  id: string;
  author: string;
  body: any;
  created: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

export class JiraClient {
  private client: AxiosInstance;
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: `${config.host}/rest/api/3`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getTicket(ticketKey: string): Promise<JiraTicket> {
    const response = await this.client.get(
      `/issue/${ticketKey}?expand=renderedFields,comments`
    );

    const data = response.data;
    const fields = data.fields;

    return {
      key: data.key,
      summary: fields.summary,
      description: fields.description,
      status: fields.status?.name || 'Unknown',
      type: fields.issuetype?.name || 'Unknown',
      priority: fields.priority?.name || 'None',
      assignee: fields.assignee?.displayName || null,
      reporter: fields.reporter?.displayName || 'Unknown',
      attachments: (fields.attachment || []).map((a: any) => ({
        id: a.id,
        filename: a.filename,
        url: a.content,
        mimeType: a.mimeType,
      })),
      comments: (fields.comment?.comments || []).map((c: any) => ({
        id: c.id,
        author: c.author?.displayName || 'Unknown',
        body: c.body,
        created: c.created,
      })),
      labels: fields.labels || [],
      customFields: this.extractCustomFields(fields),
    };
  }

  async searchTickets(jql: string, maxResults: number = 50): Promise<JiraTicket[]> {
    const response = await this.client.post('/search', {
      jql,
      maxResults,
      fields: [
        'summary',
        'description',
        'status',
        'issuetype',
        'priority',
        'assignee',
        'reporter',
        'labels',
      ],
    });

    return response.data.issues.map((issue: any) => ({
      key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description,
      status: issue.fields.status?.name || 'Unknown',
      type: issue.fields.issuetype?.name || 'Unknown',
      priority: issue.fields.priority?.name || 'None',
      assignee: issue.fields.assignee?.displayName || null,
      reporter: issue.fields.reporter?.displayName || 'Unknown',
      attachments: [],
      comments: [],
      labels: issue.fields.labels || [],
      customFields: {},
    }));
  }

  async getTicketsByStatus(projectKey: string, status: string): Promise<JiraTicket[]> {
    const jql = `project = ${projectKey} AND status = "${status}" ORDER BY priority DESC, created ASC`;
    return this.searchTickets(jql);
  }

  async addComment(ticketKey: string, comment: string): Promise<void> {
    const adfBody = this.textToAdf(comment);

    await this.client.post(`/issue/${ticketKey}/comment`, {
      body: adfBody,
    });
  }

  async getTransitions(ticketKey: string): Promise<JiraTransition[]> {
    const response = await this.client.get(`/issue/${ticketKey}/transitions`);
    return response.data.transitions.map((t: any) => ({
      id: t.id,
      name: t.name,
    }));
  }

  async transitionTicket(ticketKey: string, statusName: string): Promise<void> {
    const transitions = await this.getTransitions(ticketKey);
    const transition = transitions.find(
      t => t.name.toLowerCase() === statusName.toLowerCase()
    );

    if (!transition) {
      const available = transitions.map(t => t.name).join(', ');
      throw new Error(
        `Transition "${statusName}" not found. Available: ${available}`
      );
    }

    await this.client.post(`/issue/${ticketKey}/transitions`, {
      transition: { id: transition.id },
    });
  }

  async downloadAttachment(attachment: JiraAttachment, outputDir: string): Promise<string> {
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');

    const response = await axios.get(attachment.url, {
      headers: { 'Authorization': `Basic ${auth}` },
      responseType: 'arraybuffer',
    });

    const outputPath = path.join(outputDir, attachment.filename);
    fs.writeFileSync(outputPath, response.data);

    return outputPath;
  }

  async assignTicket(ticketKey: string, accountId: string | null): Promise<void> {
    await this.client.put(`/issue/${ticketKey}/assignee`, {
      accountId,
    });
  }

  private textToAdf(text: string): any {
    const lines = text.split('\n');
    const content = lines.map(line => {
      const lineContent = this.parseLineWithUrls(line);
      return {
        type: 'paragraph',
        content: lineContent.length > 0 ? lineContent : [{ type: 'text', text: ' ' }],
      };
    });

    return {
      type: 'doc',
      version: 1,
      content,
    };
  }

  private parseLineWithUrls(line: string): any[] {
    if (!line || line.trim() === '') {
      return [{ type: 'text', text: ' ' }];
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = line.split(urlRegex);
    const content: any[] = [];

    for (const part of parts) {
      if (!part) continue;

      if (part.match(/^https?:\/\//)) {
        content.push({
          type: 'text',
          text: part,
          marks: [{ type: 'link', attrs: { href: part } }],
        });
      } else {
        content.push({ type: 'text', text: part });
      }
    }

    return content;
  }

  private extractCustomFields(fields: any): Record<string, any> {
    const customFields: Record<string, any> = {};

    for (const key in fields) {
      if (key.startsWith('customfield_')) {
        customFields[key] = fields[key];
      }
    }

    return customFields;
  }

  getTicketUrl(ticketKey: string): string {
    return `${this.config.host}/browse/${ticketKey}`;
  }
}
