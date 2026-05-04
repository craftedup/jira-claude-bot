export interface AdfRenderOptions {
  ticketKey?: string;
}

export function formatDescription(description: any, options: AdfRenderOptions = {}): string {
  if (!description) return 'No description provided.';

  if (typeof description === 'string') {
    return description;
  }

  if (description.type === 'doc' && Array.isArray(description.content)) {
    return adfToText(description.content, options).trim();
  }

  return JSON.stringify(description, null, 2);
}

export function adfToText(content: any[], options: AdfRenderOptions = {}): string {
  if (!Array.isArray(content)) return '';

  let text = '';

  for (const node of content) {
    if (!node || typeof node !== 'object') continue;

    switch (node.type) {
      case 'paragraph':
        text += adfToText(node.content || [], options) + '\n\n';
        break;

      case 'text':
        text += renderTextNode(node);
        break;

      case 'bulletList':
        for (const item of node.content || []) {
          text += '- ' + adfToText(item.content || [], options).trim() + '\n';
        }
        text += '\n';
        break;

      case 'orderedList': {
        let num = 1;
        for (const item of node.content || []) {
          text += `${num}. ` + adfToText(item.content || [], options).trim() + '\n';
          num++;
        }
        text += '\n';
        break;
      }

      case 'listItem':
        text += adfToText(node.content || [], options);
        break;

      case 'heading': {
        const level = node.attrs?.level || 1;
        text += '#'.repeat(level) + ' ' + adfToText(node.content || [], options) + '\n\n';
        break;
      }

      case 'codeBlock':
        text += '```\n' + (node.content?.[0]?.text || '') + '\n```\n\n';
        break;

      case 'hardBreak':
        text += '\n';
        break;

      case 'inlineCard':
      case 'blockCard':
      case 'embedCard': {
        const url = node.attrs?.url;
        if (url) text += url;
        break;
      }

      case 'mediaSingle':
      case 'mediaGroup':
        text += adfToText(node.content || [], options);
        break;

      case 'media':
      case 'mediaInline': {
        text += renderMediaNode(node, options);
        break;
      }

      case 'rule':
        text += '\n---\n\n';
        break;

      case 'blockquote':
        text += '> ' + adfToText(node.content || [], options).trim().replace(/\n/g, '\n> ') + '\n\n';
        break;

      case 'mention':
        text += '@' + (node.attrs?.text || node.attrs?.displayName || node.attrs?.id || 'user');
        break;

      case 'emoji':
        text += node.attrs?.text || node.attrs?.shortName || '';
        break;

      default:
        if (node.content) {
          text += adfToText(node.content, options);
        }
    }
  }

  return text;
}

function renderTextNode(node: any): string {
  const raw = node.text || '';
  if (!Array.isArray(node.marks) || node.marks.length === 0) {
    return raw;
  }

  const linkMark = node.marks.find((m: any) => m && m.type === 'link');
  if (linkMark) {
    const href = linkMark.attrs?.href;
    if (href) {
      return raw === href ? raw : `[${raw}](${href})`;
    }
  }

  let out = raw;
  for (const mark of node.marks) {
    if (!mark || typeof mark !== 'object') continue;
    if (mark.type === 'code') out = '`' + out + '`';
    else if (mark.type === 'strong') out = '**' + out + '**';
    else if (mark.type === 'em') out = '*' + out + '*';
    else if (mark.type === 'strike') out = '~~' + out + '~~';
  }
  return out;
}

function renderMediaNode(node: any, options: AdfRenderOptions): string {
  const filename =
    node.attrs?.alt ||
    node.attrs?.filename ||
    node.attrs?.title ||
    node.attrs?.id ||
    'attachment';
  const dir = options.ticketKey
    ? `.jira-tickets/${options.ticketKey}/attachments/`
    : '.jira-tickets/<TICKET_KEY>/attachments/';
  return `[Attachment: ${filename}] (see ${dir})\n`;
}
