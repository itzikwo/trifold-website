import { describe, expect, it } from 'vitest';

import {
  markdownCandidates,
  negotiate,
  parseAccept,
  qualityOf,
} from '../src/negotiation.js';

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

describe('parseAccept', () => {
  it('treats a missing header as the wildcard range', () => {
    expect(parseAccept(null)).toEqual([{ type: '*', subtype: '*', q: 1 }]);
    expect(parseAccept('  ')).toEqual([{ type: '*', subtype: '*', q: 1 }]);
  });

  it('reads quality values and ignores other parameters', () => {
    expect(parseAccept('text/markdown;variant=GFM;q=0.9, text/html;q=0.1')).toEqual([
      { type: 'text', subtype: 'markdown', q: 0.9 },
      { type: 'text', subtype: 'html', q: 0.1 },
    ]);
  });

  it('is case insensitive and tolerates whitespace', () => {
    expect(parseAccept(' TEXT/Markdown , TEXT/* ; q=0.5 ')).toEqual([
      { type: 'text', subtype: 'markdown', q: 1 },
      { type: 'text', subtype: '*', q: 0.5 },
    ]);
  });

  it('clamps malformed quality values instead of throwing', () => {
    expect(parseAccept('text/markdown;q=nonsense')[0].q).toBe(0);
    expect(parseAccept('text/markdown;q=7')[0].q).toBe(1);
    expect(parseAccept('text/markdown;q=-2')[0].q).toBe(0);
  });
});

describe('qualityOf', () => {
  it('prefers the most specific matching range', () => {
    const ranges = parseAccept('*/*;q=0.1, text/*;q=0.5, text/markdown;q=0.9');
    expect(qualityOf(ranges, 'text/markdown')).toBe(0.9);
    expect(qualityOf(ranges, 'text/html')).toBe(0.5);
    expect(qualityOf(ranges, 'image/png')).toBe(0.1);
  });

  it('returns 0 for a type the client refuses', () => {
    const ranges = parseAccept('text/markdown');
    expect(qualityOf(ranges, 'text/html')).toBe(0);
  });
});

describe('negotiate', () => {
  it('sends browsers to HTML', () => {
    const wants = negotiate(BROWSER_ACCEPT);
    expect(wants.htmlPreferred).toBe(true);
    expect(wants.markdownPreferred).toBe(false);
    expect(wants.markdownOnly).toBe(false);
  });

  it('sends a markdown request to markdown', () => {
    const wants = negotiate('text/markdown');
    expect(wants.markdownPreferred).toBe(true);
    expect(wants.markdownOnly).toBe(true);
  });

  it('does not treat a wildcard client as preferring either variant', () => {
    const wants = negotiate('*/*');
    expect(wants.markdownPreferred).toBe(false);
    expect(wants.htmlPreferred).toBe(false);
  });

  it('respects an explicit markdown-over-html ranking', () => {
    const wants = negotiate('text/markdown;q=1.0, text/html;q=0.5');
    expect(wants.markdownPreferred).toBe(true);
    expect(wants.markdownOnly).toBe(false);
  });

  it('keeps HTML when the two are ranked equally', () => {
    const wants = negotiate('text/markdown;q=0.5, text/html;q=0.5');
    expect(wants.markdownPreferred).toBe(false);
  });
});

describe('markdownCandidates', () => {
  it('maps pages to their markdown twin', () => {
    expect(markdownCandidates('/')).toEqual(['/index.md']);
    expect(markdownCandidates('/services.html')).toEqual(['/services.md']);
    expect(markdownCandidates('/ai-strategy-playbook/')).toEqual([
      '/ai-strategy-playbook/index.md',
    ]);
    expect(markdownCandidates('/services.md')).toEqual(['/services.md']);
  });

  it('tries both shapes for an extensionless path', () => {
    expect(markdownCandidates('/services')).toEqual(['/services.md', '/services/index.md']);
  });

  it('ignores non-page assets', () => {
    expect(markdownCandidates('/styles.css')).toEqual([]);
    expect(markdownCandidates('/assets/logo.png')).toEqual([]);
    expect(markdownCandidates('/sitemap.xml')).toEqual([]);
  });
});
