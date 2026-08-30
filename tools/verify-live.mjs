#!/usr/bin/env node
/**
 * Check a deployed copy of the site the way an AI agent would.
 *
 * Usage:
 *   npm run verify:live                          # https://trifoldtechnologies.com
 *   npm run verify:live -- https://staging-host  # any other deployment
 *
 * Prints one line per check and exits non-zero if any of them fail, so it can
 * be used as a post-deploy gate. The check list is exported and exercised
 * against the worker in test/verify-live.test.js, so a passing test suite
 * means the checks themselves are right.
 */

const DEFAULT_HOST = 'https://trifoldtechnologies.com';

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

/** Pages that must answer both text/html and text/markdown. */
export const PAGES = [
  ['/', '/index.md'],
  ['/services.html', '/services.md'],
  ['/about.html', '/about.md'],
  ['/contact.html', '/contact.md'],
  ['/privacy.html', '/privacy.md'],
  ['/terms.html', '/terms.md'],
  ['/accessibility.html', '/accessibility.md'],
  ['/ai-strategy-playbook/', '/ai-strategy-playbook/index.md'],
];

const MISSING_PATH = '/some-path-that-does-not-exist';

const contentType = (response) =>
  (response.headers.get('content-type') || '').toLowerCase();

const fail = (message) => {
  throw new Error(message);
};

const expect = (condition, message) => {
  if (!condition) fail(message);
};

/**
 * The check list. Each check is { name, run(get) }, where `get(path, headers)`
 * resolves to a Response from the deployment under test.
 */
export function buildChecks() {
  const checks = [
    {
      name: 'home page serves HTML to a browser',
      async run(get) {
        const response = await get('/', { accept: BROWSER_ACCEPT });
        expect(response.status === 200, `expected 200, got ${response.status}`);
        expect(
          contentType(response).includes('text/html'),
          `expected text/html, got ${contentType(response)}`,
        );
      },
    },
    {
      name: 'home page keeps HTML for a client with no preference',
      async run(get) {
        const response = await get('/', { accept: '*/*' });
        expect(
          contentType(response).includes('text/html'),
          `expected text/html, got ${contentType(response)}`,
        );
      },
    },
    {
      name: 'home page sets Vary: Accept',
      async run(get) {
        const response = await get('/', { accept: BROWSER_ACCEPT });
        const vary = (response.headers.get('vary') || '').toLowerCase();
        expect(vary.includes('accept'), `Vary was "${response.headers.get('vary')}"`);
      },
    },
    {
      name: 'home page advertises its markdown twin',
      async run(get) {
        const response = await get('/', { accept: BROWSER_ACCEPT });
        const link = response.headers.get('link') || '';
        const body = await response.text();
        expect(
          link.includes('text/markdown') ||
            body.includes('rel="alternate" type="text/markdown"'),
          'no markdown alternate in the Link header or the page head',
        );
      },
    },
    {
      name: 'home page carries JSON-LD',
      async run(get) {
        const body = await (await get('/', { accept: BROWSER_ACCEPT })).text();
        const match = body.match(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
        );
        expect(match !== null, 'no application/ld+json block found');
        const data = JSON.parse(match[1]);
        expect(data['@context'] === 'https://schema.org', 'unexpected @context');
        const graph = data['@graph'] || [data];
        const organisation = graph.find((node) =>
          [].concat(node['@type']).includes('Organization'),
        );
        expect(organisation !== undefined, 'no Organization node');
        expect(
          organisation.name === 'TriFold Technologies',
          `Organization name was "${organisation.name}"`,
        );
      },
    },
  ];

  for (const [page, twin] of PAGES) {
    checks.push({
      name: `${page} negotiates markdown`,
      async run(get) {
        const response = await get(page, { accept: 'text/markdown' });
        expect(response.status === 200, `expected 200, got ${response.status}`);
        expect(
          contentType(response).startsWith('text/markdown'),
          `expected text/markdown, got ${contentType(response) || '(none)'}`,
        );
        const vary = (response.headers.get('vary') || '').toLowerCase();
        expect(vary.includes('accept'), `Vary was "${response.headers.get('vary')}"`);
        const location = response.headers.get('content-location');
        expect(
          location === null || location === twin,
          `Content-Location was "${location}", expected ${twin}`,
        );
        const body = await response.text();
        expect(body.startsWith('# '), 'markdown body does not start with a heading');
      },
    });
  }

  checks.push(
    {
      name: 'a .md URL serves markdown directly',
      async run(get) {
        const response = await get('/index.md');
        expect(response.status === 200, `expected 200, got ${response.status}`);
        expect(
          contentType(response).startsWith('text/markdown'),
          `expected text/markdown, got ${contentType(response) || '(none)'}`,
        );
      },
    },
    {
      name: 'an unknown path returns a real 404',
      async run(get) {
        const response = await get(MISSING_PATH, { accept: BROWSER_ACCEPT });
        expect(response.status === 404, `expected 404, got ${response.status}`);
      },
    },
    {
      name: 'the 404 an agent sees is markdown it can recover from',
      async run(get) {
        const response = await get(MISSING_PATH, { accept: '*/*' });
        expect(response.status === 404, `expected 404, got ${response.status}`);
        expect(
          contentType(response).startsWith('text/markdown'),
          `expected text/markdown, got ${contentType(response) || '(none)'}`,
        );
        const body = await response.text();
        expect(body.includes('sitemap.xml'), 'no sitemap link in the 404 body');
        expect(body.includes('llms.txt'), 'no llms.txt link in the 404 body');
      },
    },
    {
      name: 'llms.txt exists and says when to use TriFold',
      async run(get) {
        const response = await get('/llms.txt');
        expect(response.status === 200, `expected 200, got ${response.status}`);
        const body = await response.text();
        expect(body.startsWith('# TriFold Technologies'), 'unexpected first line');
        expect(body.includes('## When to use this'), 'no "When to use this" section');
        expect(
          body.includes('https://cal.com/itzik-woda/30min'),
          'no booking link for an agent to hand the user',
        );
      },
    },
    {
      name: 'robots.txt allows live AI agents',
      async run(get) {
        const response = await get('/robots.txt');
        expect(response.status === 200, `expected 200, got ${response.status}`);
        const body = await response.text();
        for (const agent of [
          'ClaudeBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'PerplexityBot',
          'Google-Extended',
          'DeepSeekBot',
        ]) {
          expect(body.includes(`User-agent: ${agent}`), `${agent} is not listed`);
        }
        expect(body.includes('Sitemap:'), 'no Sitemap line');
        expect(body.includes('llms.txt'), 'llms.txt is not referenced');
      },
    },
    {
      name: 'every URL in the sitemap resolves',
      async run(get) {
        const response = await get('/sitemap.xml');
        expect(response.status === 200, `expected 200, got ${response.status}`);
        const body = await response.text();
        const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
        expect(locations.length > 0, 'sitemap lists no URLs');

        const broken = [];
        for (const location of locations) {
          // Follow the sitemap's paths on the host being checked, not the
          // canonical domain the sitemap names.
          const path = new URL(location).pathname;
          const page = await get(path, { accept: BROWSER_ACCEPT });
          if (page.status !== 200) broken.push(`${path} -> ${page.status}`);
        }
        expect(broken.length === 0, `broken: ${broken.join(', ')}`);
      },
    },
  );

  return checks;
}

/** Run every check, returning results rather than throwing. */
export async function runChecks(host, fetchImpl = fetch) {
  const checks = buildChecks();
  const get = (path, headers = {}) =>
    fetchImpl(new URL(path, host).toString(), { headers, redirect: 'follow' });

  const results = [];
  for (const check of checks) {
    try {
      await check.run(get);
      results.push({ name: check.name, ok: true });
    } catch (error) {
      results.push({ name: check.name, ok: false, detail: error.message });
    }
  }
  return results;
}

async function main() {
  const host = process.argv[2] || DEFAULT_HOST;
  console.log(`Checking ${host}\n`);

  const results = await runChecks(host);
  for (const result of results) {
    console.log(
      result.ok ? `  ok    ${result.name}` : `  FAIL  ${result.name}\n          ${result.detail}`,
    );
  }

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed on ${host}`,
  );
  if (failed.length > 0) process.exit(1);
}

// Run only when invoked as a script. Guarded so the checks can also be
// imported by the test suite, which runs in the Workers runtime with no
// `process` global.
const isCli =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === new URL(process.argv[1], `file://${process.cwd()}/`).href;

if (isCli) await main();
