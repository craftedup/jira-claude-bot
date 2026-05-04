import { adfToText, formatDescription } from '../adf';

describe('adfToText', () => {
  describe('text node link marks', () => {
    it('renders a text node with a link mark as markdown link', () => {
      const out = adfToText([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            {
              type: 'text',
              text: 'Design:',
              marks: [{ type: 'link', attrs: { href: 'https://figma.com/file/abc' } }],
            },
            { type: 'text', text: ' for details.' },
          ],
        },
      ]);

      expect(out).toContain('[Design:](https://figma.com/file/abc)');
      expect(out).toContain('See ');
      expect(out).toContain(' for details.');
    });

    it('does not double-render when display text equals href', () => {
      const out = adfToText([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'https://example.com',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ]);

      expect(out.trim()).toBe('https://example.com');
    });

    it('preserves URL when display text is non-URL', () => {
      const out = adfToText([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/x' } }],
            },
          ],
        },
      ]);

      expect(out).toContain('https://example.com/x');
    });
  });

  describe('inlineCard nodes', () => {
    it('renders inlineCard URL directly', () => {
      const out = adfToText([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Reference: ' },
            {
              type: 'inlineCard',
              attrs: { url: 'https://figma.com/file/xyz/Design' },
            },
          ],
        },
      ]);

      expect(out).toContain('https://figma.com/file/xyz/Design');
    });

    it('renders blockCard URL directly', () => {
      const out = adfToText([
        {
          type: 'blockCard',
          attrs: { url: 'https://example.com/board/1' },
        },
      ]);

      expect(out).toContain('https://example.com/board/1');
    });
  });

  describe('media nodes', () => {
    it('renders mediaSingle children with attachment note', () => {
      const out = adfToText(
        [
          {
            type: 'mediaSingle',
            content: [
              {
                type: 'media',
                attrs: { type: 'file', id: 'abc-123', alt: 'screenshot.png' },
              },
            ],
          },
        ],
        { ticketKey: 'PROJ-42' }
      );

      expect(out).toContain('screenshot.png');
      expect(out).toContain('.jira-tickets/PROJ-42/attachments/');
    });

    it('renders mediaInline as attachment note', () => {
      const out = adfToText(
        [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See ' },
              {
                type: 'mediaInline',
                attrs: { type: 'file', id: 'inline-1', alt: 'diagram.svg' },
              },
            ],
          },
        ],
        { ticketKey: 'PROJ-42' }
      );

      expect(out).toContain('diagram.svg');
      expect(out).toContain('.jira-tickets/PROJ-42/attachments/');
    });

    it('falls back to filename or id when alt is missing', () => {
      const out = adfToText([
        {
          type: 'media',
          attrs: { type: 'file', id: 'file-id-only' },
        },
      ]);

      expect(out).toContain('file-id-only');
    });

    it('uses placeholder path when ticketKey is not provided', () => {
      const out = adfToText([
        {
          type: 'media',
          attrs: { type: 'file', alt: 'x.png' },
        },
      ]);

      expect(out).toContain('<TICKET_KEY>');
    });
  });

  describe('formatDescription', () => {
    it('returns placeholder for empty input', () => {
      expect(formatDescription(null)).toBe('No description provided.');
      expect(formatDescription(undefined)).toBe('No description provided.');
    });

    it('passes through plain string input', () => {
      expect(formatDescription('hello world')).toBe('hello world');
    });

    it('renders an ADF doc preserving link URLs', () => {
      const doc = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Design:',
                marks: [{ type: 'link', attrs: { href: 'https://figma.com/x' } }],
              },
            ],
          },
        ],
      };

      expect(formatDescription(doc)).toContain('https://figma.com/x');
    });
  });
});
