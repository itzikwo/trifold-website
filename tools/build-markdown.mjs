#!/usr/bin/env node
/**
 * Generate the markdown twin of every HTML page.
 *
 * The worker serves these files to clients that send `Accept: text/markdown`
 * (see src/index.js), so they have to stay in step with the HTML. Run
 * `npm run build:markdown` after editing a page; `npm test` fails if the
 * committed .md files no longer match their .html source.
 *
 * `--check` prints the files that would change and exits non-zero, without
 * writing anything.
 *
 * ai-strategy-playbook/index.md is maintained by hand: that page is a
 * 140 KB Hebrew playbook with no <main> element, and a curated summary is far
 * more useful to an agent than a transcription.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://trifoldtechnologies.com';

/** HTML pages with a <main> element, in sitemap order. */
export const PAGES = [
  { html: 'index.html', md: 'index.md', url: '/' },
  { html: 'services.html', md: 'services.md', url: '/services.html' },
  { html: 'about.html', md: 'about.md', url: '/about.html' },
  { html: 'contact.html', md: 'contact.md', url: '/contact.html' },
  { html: 'privacy.html', md: 'privacy.md', url: '/privacy.html' },
  { html: 'terms.html', md: 'terms.md', url: '/terms.html' },
  { html: 'accessibility.html', md: 'accessibility.md', url: '/accessibility.html' },
  { html: '404.html', md: '404.md', url: '/404.html' },
];

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const BLOCK_ELEMENTS = new Set([
  'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li',
  'main', 'nav', 'ol', 'p', 'section', 'table', 'ul',
]);

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  times: '×', middot: '·', deg: '°', euro: '€', pound: '£', copy: '©',
  reg: '®', trade: '™', larr: '←', rarr: '→', harr: '↔', bull: '•',
};

export function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    const named = ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function parseAttributes(raw) {
  const attributes = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let match;
  while ((match = pattern.exec(raw)) !== null) {
    const value = match[2] === undefined ? '' : match[2].replace(/^["']|["']$/g, '');
    attributes[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attributes;
}

/** Minimal, forgiving HTML parser: enough for this site's hand-written pages. */
export function parseHtml(html) {
  const root = { tag: '#root', attributes: {}, children: [] };
  const stack = [root];
  const token = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!\w[^>]*>|<\/([a-zA-Z][^\s>]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;
  let cursor = 0;
  let match;

  const addText = (text) => {
    if (text === '') return;
    stack[stack.length - 1].children.push({ type: 'text', value: decodeEntities(text) });
  };

  while ((match = token.exec(html)) !== null) {
    addText(html.slice(cursor, match.index));
    cursor = token.lastIndex;

    const [full, closing, opening, rawAttributes] = match;
    if (closing) {
      const tag = closing.toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    if (!opening) continue; // comment, doctype or CDATA

    const tag = opening.toLowerCase();
    const node = {
      type: 'element',
      tag,
      attributes: parseAttributes(rawAttributes || ''),
      children: [],
    };
    stack[stack.length - 1].children.push(node);

    const selfClosing = /\/\s*$/.test(rawAttributes || '');
    if (VOID_ELEMENTS.has(tag) || selfClosing) continue;

    if (tag === 'script' || tag === 'style') {
      const end = html.toLowerCase().indexOf(`</${tag}`, cursor);
      cursor = end === -1 ? html.length : end;
      token.lastIndex = cursor;
      continue;
    }

    stack.push(node);
  }

  addText(html.slice(cursor));
  return root;
}

export function findElement(node, predicate) {
  if (node.type === 'element' && predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

const squash = (text) => text.replace(/\s+/g, ' ');

const INLINE_ELEMENTS = new Set(['a', 'abbr', 'b', 'code', 'em', 'i', 'img', 'small', 'span', 'strong']);

/** Absolute URLs for markdown consumers, which have no page to resolve against. */
const absolute = (url) => (url.startsWith('/') ? `${SITE}${url}` : url);

/**
 * Render children in order, keeping a space between two adjacent elements that
 * would otherwise collide ("01" + "AI strategy" -> "01 AI strategy").
 */
function renderChildren(node) {
  let out = '';
  for (const child of node.children || []) {
    const piece = renderInline(child);
    if (piece === '') continue;
    if (out !== '' && !/\s$/.test(out) && !/^\s/.test(piece) && child.type === 'element') {
      out += ' ';
    }
    out += piece;
  }
  return out;
}

function renderInline(node) {
  if (node.type === 'text') return squash(node.value);
  if (node.type !== 'element') return '';

  const inner = renderChildren(node);
  switch (node.tag) {
    case 'br':
      return '\n';
    case 'a': {
      const href = node.attributes.href;
      const text = inner.trim();
      if (!href || text === '') return text;
      return `[${text}](${absolute(href)})`;
    }
    case 'strong':
    case 'b':
      return inner.trim() === '' ? '' : `**${inner.trim()}**`;
    case 'em':
    case 'i':
      return inner.trim() === '' ? '' : `*${inner.trim()}*`;
    case 'code':
      return inner.trim() === '' ? '' : `\`${inner.trim()}\``;
    case 'img': {
      const src = node.attributes.src;
      return src ? `![${node.attributes.alt || ''}](${absolute(src)})` : '';
    }
    default: {
      const classes = node.attributes.class || '';
      // Eyebrows and kickers are the page's small-caps labels: keep the
      // emphasis they carry visually.
      if (/\b(eyebrow|kicker)\b/.test(classes) && inner.trim() !== '') {
        return `**${inner.trim()}**`;
      }
      return inner;
    }
  }
}

const inlineText = (node) => squash(renderChildren(node)).trim();

const hasBlockChild = (node) =>
  (node.children || []).some(
    (child) =>
      child.type === 'element' &&
      (BLOCK_ELEMENTS.has(child.tag) || hasBlockChild(child)),
  );

function renderBlocks(node, out = []) {
  for (const child of node.children || []) {
    if (child.type === 'text') {
      const text = squash(child.value).trim();
      if (text !== '') out.push(text);
      continue;
    }
    if (child.type !== 'element') continue;

    const { tag } = child;
    if (tag === 'script' || tag === 'style') continue;
    if (child.attributes['aria-hidden'] === 'true') continue;

    if (/^h[1-6]$/.test(tag)) {
      const text = inlineText(child);
      if (text !== '') out.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = child.children
        .filter((item) => item.type === 'element' && item.tag === 'li')
        .map((item, index) =>
          `${tag === 'ol' ? `${index + 1}.` : '-'} ${inlineText(item)}`);
      if (items.length > 0) out.push(items.join('\n'));
      continue;
    }

    if (tag === 'hr') continue;

    if (tag === 'p' || tag === 'blockquote' || !hasBlockChild(child)) {
      // An inline element standing on its own still renders as itself, so a
      // bare <a> keeps its link instead of collapsing to its text.
      const text = INLINE_ELEMENTS.has(tag)
        ? squash(renderInline(child)).trim()
        : inlineText(child);
      if (text === '') continue;
      if (tag === 'blockquote') {
        out.push(`> ${text}`);
      } else if (/\b(eyebrow|kicker)\b/.test(child.attributes.class || '')) {
        out.push(`**${text}**`);
      } else {
        out.push(text);
      }
      continue;
    }

    renderBlocks(child, out);
  }
  return out;
}

function metaContent(head, selector) {
  const node = findElement(
    head,
    (element) =>
      element.tag === 'meta' &&
      (element.attributes.name === selector || element.attributes.property === selector),
  );
  return node ? node.attributes.content || '' : '';
}

const NAV = [
  ['Home', '/'],
  ['Services', '/services.html'],
  ['About', '/about.html'],
  ['Contact', '/contact.html'],
  ['AI strategy playbook (Hebrew)', '/ai-strategy-playbook/'],
];

export function htmlToMarkdown(html, page) {
  const document = parseHtml(html);
  const main = findElement(document, (node) => node.tag === 'main');
  if (!main) throw new Error(`${page.html} has no <main> element`);

  const titleNode = findElement(document, (node) => node.tag === 'title');
  const title = titleNode ? inlineText(titleNode) : 'TriFold Technologies';
  const description = metaContent(document, 'description');

  const blocks = renderBlocks(main);
  // The <h1> becomes the document title, so drop it from the body.
  const firstHeading = blocks.findIndex((block) => block.startsWith('# '));
  const heading = firstHeading === -1 ? title : blocks[firstHeading].slice(2);
  if (firstHeading !== -1) blocks.splice(firstHeading, 1);

  const body = blocks;

  const footer = [
    '## Other pages',
    NAV.filter(([, href]) => href !== page.url)
      .map(([label, href]) => `- [${label}](${SITE}${href})`)
      .join('\n'),
    '## Machine-readable index',
    [
      `- [llms.txt](${SITE}/llms.txt) — what TriFold does and when to use it`,
      `- [sitemap.xml](${SITE}/sitemap.xml) — every page on the site`,
      `- Every page also answers \`Accept: text/markdown\` with this markdown.`,
    ].join('\n'),
    '## Contact',
    [
      '- Itzik Woda, founder and fractional Chief AI Officer, TriFold Technologies',
      '- Email: itzik.woda@trifoldtechnologies.com',
      '- Phone: +972-52-8544775',
      '- Book a 30-minute intro call: https://cal.com/itzik-woda/30min',
    ].join('\n'),
  ];

  const header = [`# ${heading}`];
  if (description !== '') header.push(`> ${description}`);
  header.push(`Canonical HTML page: ${SITE}${page.url}`);

  return `${[...header, ...body, ...footer].join('\n\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export async function renderPage(page) {
  const html = await readFile(resolve(ROOT, page.html), 'utf8');
  return htmlToMarkdown(html, page);
}

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];

  for (const page of PAGES) {
    const markdown = await renderPage(page);
    const target = resolve(ROOT, page.md);
    const current = await readFile(target, 'utf8').catch(() => null);
    if (current === markdown) continue;
    stale.push(page.md);
    if (!check) await writeFile(target, markdown, 'utf8');
  }

  if (check && stale.length > 0) {
    console.error(`Out of date, run "npm run build:markdown":\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    check
      ? 'All markdown twins are up to date.'
      : stale.length === 0
        ? 'All markdown twins were already up to date.'
        : `Wrote:\n  ${stale.join('\n  ')}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
