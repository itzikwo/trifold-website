/**
 * The machine-readable surface: llms.txt, robots.txt, sitemap.xml, the JSON-LD
 * on each page, and the markdown twins the worker serves. Everything is
 * fetched through the worker, so these assert what an agent actually receives.
 */
import { exports as workerExports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const SITE = 'https://trifoldtechnologies.com';

const text = async (path, headers = {}) => {
  const response = await workerExports.default.fetch(new Request(`${SITE}${path}`, { headers }));
  expect(response.status, path).toBe(200);
  return response.text();
};

const HTML_PAGES = [
  '/',
  '/services.html',
  '/about.html',
  '/contact.html',
  '/ai-strategy-playbook/',
];

const jsonLdFrom = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1]),
  );

describe('llms.txt', () => {
  let llms;
  beforeAll(async () => {
    llms = await text('/llms.txt');
  });

  it('follows the llms.txt shape: H1, then a blockquote summary', () => {
    const lines = llms.split('\n');
    expect(lines[0]).toBe('# TriFold Technologies');
    expect(lines[2].startsWith('> ')).toBe(true);
  });

  it('tells an agent when to use TriFold', () => {
    expect(llms).toContain('## When to use this');
    expect(llms).toContain('## How an agent should act');
    // Named jobs, not generic marketing copy.
    expect(llms).toContain('AI pilots that never reach production');
    expect(llms).toContain('Do **not** route here for');
  });

  it('gives an agent a concrete next action and contact route', () => {
    expect(llms).toContain('https://cal.com/itzik-woda/30min');
    expect(llms).toContain('itzik.woda@trifoldtechnologies.com');
  });

  it('links the pages it lists, in markdown', () => {
    for (const page of ['/index.md', '/services.md', '/about.md', '/contact.md']) {
      expect(llms, page).toContain(`(${SITE}${page})`);
    }
  });
});

describe('robots.txt', () => {
  let robots;
  beforeAll(async () => {
    robots = await text('/robots.txt');
  });

  const groupFor = (robots, agent) =>
    robots
      .split(/\n(?=User-agent:)/)
      .find((section) => section.startsWith(`User-agent: ${agent}`));

  it('allows live AI agents and AI search crawlers', () => {
    for (const agent of [
      'ClaudeBot',
      'Claude-User',
      'Claude-SearchBot',
      'ChatGPT-User',
      'OAI-SearchBot',
      'PerplexityBot',
      'Perplexity-User',
    ]) {
      const block = groupFor(robots, agent);
      expect(block, agent).toBeDefined();
      expect(block, agent).toContain('Allow: /');
    }
  });

  it('grants training use to the two agents named for it, and no others', () => {
    for (const agent of ['Google-Extended', 'DeepSeekBot']) {
      const block = groupFor(robots, agent);
      expect(block, agent).toBeDefined();
      expect(block, agent).toContain('Allow: /');
      expect(block, agent).toContain('ai-train=yes');
    }

    // The grant is by name; everything else still hits the default reservation.
    const granted = robots.match(/ai-train=yes/g) || [];
    expect(granted).toHaveLength(2);
    expect(groupFor(robots, 'GPTBot')).toContain('Disallow: /');
  });

  it('keeps the sitemap and points at llms.txt', () => {
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots).toContain(`${SITE}/llms.txt`);
  });

  it('still reserves training rights by default', () => {
    expect(groupFor(robots, '*')).toContain(
      'Content-Signal: search=yes,ai-input=yes,ai-train=no',
    );
  });
});

describe('sitemap.xml', () => {
  it('lists URLs that all resolve', async () => {
    const sitemap = await text('/sitemap.xml');
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locations.length).toBeGreaterThan(5);
    expect(locations).toContain(`${SITE}/llms.txt`);

    for (const location of locations) {
      const response = await workerExports.default.fetch(new Request(location));
      expect(response.status, location).toBe(200);
    }
  });
});

describe('JSON-LD', () => {
  it('is present and parses on every main page', async () => {
    for (const page of HTML_PAGES) {
      const blocks = jsonLdFrom(await text(page));
      expect(blocks.length, page).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(block['@context'], page).toBe('https://schema.org');
        expect(Array.isArray(block['@graph']), page).toBe(true);
        for (const node of block['@graph']) {
          expect(node['@type'], `${page} ${node['@id']}`).toBeTruthy();
        }
      }
    }
  });

  it('describes the organisation on the home page', async () => {
    const [graph] = jsonLdFrom(await text('/'));
    const organisation = graph['@graph'].find((node) =>
      [].concat(node['@type']).includes('Organization'),
    );

    expect(organisation).toBeDefined();
    expect(organisation.name).toBe('TriFold Technologies');
    expect(organisation.url).toBe(`${SITE}/`);
    expect(organisation.description).toBeTruthy();
    expect(organisation.email).toBe('itzik.woda@trifoldtechnologies.com');
    expect(organisation.sameAs).toContain('https://www.linkedin.com/in/itzikwoda');
    expect([].concat(organisation['@type'])).toContain('ProfessionalService');
  });

  it('names the person behind the practice', async () => {
    const [graph] = jsonLdFrom(await text('/about.html'));
    const person = graph['@graph'].find((node) => node['@type'] === 'Person');
    expect(person.name).toBe('Itzik Woda');
    expect(person.jobTitle).toBe('Fractional Chief AI Officer');
    expect(person.worksFor['@id']).toBe(`${SITE}/#organization`);
  });

  it('lists the services as an offer catalog', async () => {
    const [graph] = jsonLdFrom(await text('/services.html'));
    const catalog = graph['@graph'].find((node) => node['@type'] === 'OfferCatalog');
    expect(catalog.itemListElement).toHaveLength(6);
    expect(catalog.itemListElement.map((offer) => offer.itemOffered.name)).toContain(
      'AI governance',
    );
  });
});

describe('markdown twins', () => {
  it('carry the page content, absolute links and an agent index', async () => {
    const home = await text('/', { accept: 'text/markdown' });
    expect(home).toContain('# Your AI pilots worked. So why is nothing in production?');
    expect(home).toContain('Canonical HTML page: https://trifoldtechnologies.com/');
    expect(home).toContain('## Machine-readable index');
    expect(home).toContain(`[Services](${SITE}/services.html)`);
    // No relative links: an agent may hold the markdown with no base URL.
    expect(home).not.toMatch(/\]\(\/[^)]/);
  });

  it('are discoverable from the HTML page', async () => {
    const html = await text('/services.html');
    expect(html).toContain(
      '<link rel="alternate" type="text/markdown" href="/services.md"',
    );
  });
});
