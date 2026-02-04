import { JiraComment } from '../clients/jira';

/**
 * Patterns to exclude from screenshot capture.
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  /\.atlassian\.net/i,
  /jira\./i,
  /github\.com\/.*\/pull\//i,
  /github\.com\/.*\/issues\//i,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|bmp)(\?|$)/i,
  /\/api\//i,
  /\/rest\//i,
  /localhost/i,
  /127\.0\.0\.1/i,
];

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

/**
 * Extract URLs from an ADF (Atlassian Document Format) node tree.
 */
function extractUrlsFromAdf(node: any): string[] {
  const urls: string[] = [];

  if (!node || typeof node !== 'object') {
    return urls;
  }

  // Check for inlineCard nodes (smart links)
  if (node.type === 'inlineCard' && node.attrs?.url) {
    urls.push(node.attrs.url);
  }

  // Check for link marks on text nodes
  if (node.marks && Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (mark.type === 'link' && mark.attrs?.href) {
        urls.push(mark.attrs.href);
      }
    }
  }

  // Check text content for raw URLs
  if (node.type === 'text' && typeof node.text === 'string') {
    const matches = node.text.match(URL_REGEX);
    if (matches) {
      urls.push(...matches);
    }
  }

  // Recurse into children
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      urls.push(...extractUrlsFromAdf(child));
    }
  }

  return urls;
}

/**
 * Extract URLs from plain text content.
 */
function extractUrlsFromText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  const matches = text.match(URL_REGEX);
  return matches || [];
}

/**
 * Extract URLs from ticket description and comments.
 * Comments are processed newest-first so more recent URLs appear earlier.
 * Returns deduplicated URLs.
 */
export function extractUrlsFromTicket(
  description: any,
  comments: JiraComment[]
): string[] {
  const urls: string[] = [];

  // Extract from description (can be ADF object or plain text string)
  if (description) {
    if (typeof description === 'string') {
      urls.push(...extractUrlsFromText(description));
    } else if (typeof description === 'object') {
      urls.push(...extractUrlsFromAdf(description));
    }
  }

  // Extract from comments, newest first
  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  for (const comment of sortedComments) {
    if (comment.body) {
      if (typeof comment.body === 'string') {
        urls.push(...extractUrlsFromText(comment.body));
      } else if (typeof comment.body === 'object') {
        urls.push(...extractUrlsFromAdf(comment.body));
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(urls)];
}

/**
 * Filter URLs to only those suitable for screenshotting.
 * Excludes Jira URLs, GitHub PR URLs, image files, API endpoints, etc.
 */
export function filterScreenshotableUrls(
  urls: string[],
  extraExcludePatterns?: string[]
): string[] {
  const patterns = [...DEFAULT_EXCLUDE_PATTERNS];

  if (extraExcludePatterns) {
    for (const pattern of extraExcludePatterns) {
      try {
        patterns.push(new RegExp(pattern, 'i'));
      } catch {
        // Skip invalid regex patterns
      }
    }
  }

  return urls.filter(url => {
    return !patterns.some(pattern => pattern.test(url));
  });
}
