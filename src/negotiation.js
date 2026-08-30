/**
 * HTTP content negotiation helpers for markdown-aware agents.
 *
 * Follows the Accept: text/markdown convention (acceptmarkdown.com), which is
 * ordinary RFC 9110 proactive negotiation over the text/markdown media type
 * registered in RFC 7763.
 */

export const MARKDOWN_TYPE = 'text/markdown; charset=utf-8';
export const VARY_VALUE = 'Accept, Accept-Encoding';

/**
 * Parse an Accept header into media ranges with their quality values.
 * A missing or empty header means "anything is fine" and is treated as the
 * wildcard range, exactly as RFC 9110 section 12.5.1 prescribes.
 *
 * @param {string | null | undefined} header
 * @returns {{ type: string, subtype: string, q: number }[]}
 */
export function parseAccept(header) {
  if (header == null || header.trim() === '') {
    return [{ type: '*', subtype: '*', q: 1 }];
  }

  const ranges = [];
  for (const part of header.split(',')) {
    const [rawRange, ...rawParams] = part.split(';');
    const range = rawRange.trim().toLowerCase();
    if (range === '') continue;

    const slash = range.indexOf('/');
    const type = slash === -1 ? range : range.slice(0, slash);
    const subtype = slash === -1 ? '*' : range.slice(slash + 1);

    let q = 1;
    for (const rawParam of rawParams) {
      const eq = rawParam.indexOf('=');
      if (eq === -1) continue;
      const name = rawParam.slice(0, eq).trim().toLowerCase();
      if (name !== 'q') continue;
      const parsed = Number.parseFloat(rawParam.slice(eq + 1).trim());
      q = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 1);
    }

    ranges.push({ type, subtype, q });
  }

  return ranges.length > 0 ? ranges : [{ type: '*', subtype: '*', q: 1 }];
}

/**
 * Quality the client assigned to a concrete media type. The most specific
 * matching range wins: `text/markdown` beats `text/*`, which beats `*​/*`.
 *
 * @param {ReturnType<typeof parseAccept>} ranges
 * @param {string} mediaType e.g. "text/markdown"
 * @returns {number} 0 when the client will not accept the type
 */
export function qualityOf(ranges, mediaType) {
  const [type, subtype] = mediaType.toLowerCase().split('/');
  let best = 0;
  let bestSpecificity = -1;

  for (const range of ranges) {
    let specificity;
    if (range.type === type && range.subtype === subtype) specificity = 2;
    else if (range.type === type && range.subtype === '*') specificity = 1;
    else if (range.type === '*' && range.subtype === '*') specificity = 0;
    else continue;

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      best = range.q;
    }
  }

  return best;
}

/**
 * How a request wants a page rendered.
 *
 * - `markdownPreferred`: the client asked for markdown more strongly than HTML.
 * - `markdownOnly`: the client asked for markdown and refuses HTML, so an
 *   HTML fallback would be a lie and 406 is the correct answer.
 * - `htmlPreferred`: the client asked for HTML more strongly than markdown,
 *   which is what every browser does.
 *
 * @param {string | null | undefined} acceptHeader
 */
export function negotiate(acceptHeader) {
  const ranges = parseAccept(acceptHeader);
  const markdown = qualityOf(ranges, 'text/markdown');
  const html = qualityOf(ranges, 'text/html');

  return {
    markdownQuality: markdown,
    htmlQuality: html,
    markdownPreferred: markdown > 0 && markdown > html,
    markdownOnly: markdown > 0 && html === 0,
    htmlPreferred: html > 0 && html > markdown,
  };
}

/**
 * Markdown twins for a page path, in the order they should be tried.
 * Returns an empty array for paths that are not pages (assets, images, feeds).
 *
 * @param {string} pathname
 * @returns {string[]}
 */
export function markdownCandidates(pathname) {
  if (!pathname.startsWith('/')) return [];
  if (pathname.endsWith('/')) return [`${pathname}index.md`];
  if (pathname.endsWith('.html')) return [`${pathname.slice(0, -'.html'.length)}.md`];
  if (pathname.endsWith('.md')) return [pathname];

  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) return [];

  return [`${pathname}.md`, `${pathname}/index.md`];
}
