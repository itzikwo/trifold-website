import { exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const SITE = 'https://trifoldtechnologies.com';

const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

/** Request the deployed worker exactly as a client would. */
const get = (path, headers = {}, init = {}) =>
  workerExports.default.fetch(new Request(`${SITE}${path}`, { headers, ...init }));

describe('HTML stays the default', () => {
  it('serves the home page to a browser', async () => {
    const response = await get('/', { accept: BROWSER_ACCEPT });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('So why is nothing in production?');
  });

  it('serves HTML to a client with no preference (Accept: */*)', async () => {
    const response = await get('/services.html', { accept: '*/*' });
    expect(response.headers.get('content-type')).toContain('text/html');
  });

  it('varies on Accept so a CDN cannot mix the two variants up', async () => {
    const response = await get('/', { accept: BROWSER_ACCEPT });
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
  });

  it('advertises the markdown twin with a Link header', async () => {
    const response = await get('/services.html', { accept: BROWSER_ACCEPT });
    expect(response.headers.get('link')).toContain(
      '</services.md>; rel="alternate"; type="text/markdown"',
    );
  });

  it('leaves static assets alone', async () => {
    const response = await get('/styles.css');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/css');
    expect(response.headers.get('vary')).not.toBe('Accept, Accept-Encoding');
  });
});

describe('markdown content negotiation', () => {
  it('returns markdown for Accept: text/markdown', async () => {
    const response = await get('/', { accept: 'text/markdown' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
    expect(response.headers.get('content-location')).toBe('/index.md');
    expect(await response.text()).toMatch(/^# Your AI pilots worked/);
  });

  it('honours quality values', async () => {
    const preferred = await get('/about.html', {
      accept: 'text/markdown;q=1.0, text/html;q=0.4',
    });
    expect(preferred.headers.get('content-type')).toBe('text/markdown; charset=utf-8');

    const declined = await get('/about.html', {
      accept: 'text/markdown;q=0.4, text/html;q=1.0',
    });
    expect(declined.headers.get('content-type')).toContain('text/html');
  });

  it('negotiates every page that has a twin', async () => {
    const pages = [
      ['/', '/index.md'],
      ['/services.html', '/services.md'],
      ['/about.html', '/about.md'],
      ['/contact.html', '/contact.md'],
      ['/privacy.html', '/privacy.md'],
      ['/terms.html', '/terms.md'],
      ['/accessibility.html', '/accessibility.md'],
      ['/ai-strategy-playbook/', '/ai-strategy-playbook/index.md'],
    ];

    for (const [path, twin] of pages) {
      const response = await get(path, { accept: 'text/markdown' });
      expect(response.status, path).toBe(200);
      expect(response.headers.get('content-type'), path).toBe('text/markdown; charset=utf-8');
      expect(response.headers.get('content-location'), path).toBe(twin);
      expect((await response.text()).startsWith('# '), path).toBe(true);
    }
  });

  it('forgives a dropped .html extension', async () => {
    const response = await get('/services', { accept: 'text/markdown' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-location')).toBe('/services.md');
  });

  it('serves a .md URL as markdown even without an Accept header', async () => {
    const response = await get('/index.md');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
  });

  it('answers HEAD with headers and no body', async () => {
    const response = await get('/', { accept: 'text/markdown' }, { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe('');
  });

  it('does not negotiate non-page assets', async () => {
    const response = await get('/sitemap.xml', { accept: 'text/markdown' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).not.toContain('text/markdown');
  });
});

describe('404s agents can recover from', () => {
  it('returns a real 404 for a path that does not exist', async () => {
    const response = await get('/some-path-that-does-not-exist', { accept: BROWSER_ACCEPT });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
  });

  it('gives a markdown body to a client that does not insist on HTML', async () => {
    for (const accept of ['*/*', 'text/markdown', undefined]) {
      const response = await get(
        '/some-path-that-does-not-exist',
        accept === undefined ? {} : { accept },
      );
      expect(response.status, accept).toBe(404);
      expect(response.headers.get('content-type'), accept).toBe('text/markdown; charset=utf-8');

      const body = await response.text();
      expect(body, accept).toContain('# This page does not exist');
      expect(body, accept).toContain(`${SITE}/sitemap.xml`);
      expect(body, accept).toContain(`${SITE}/llms.txt`);
      expect(body, accept).toContain(`${SITE}/services.html`);
    }
  });

  it('404s a missing .md file too', async () => {
    const response = await get('/nope.md', { accept: 'text/markdown' });
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
  });

  it('keeps the designed 404 page for browsers', async () => {
    const response = await get('/nope', { accept: BROWSER_ACCEPT });
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Error 404');
  });
});

describe('non-page methods', () => {
  it('passes POST through to the asset server untouched', async () => {
    const response = await get('/', { accept: 'text/markdown' }, { method: 'POST' });
    expect(response.status).toBe(405);
    expect(response.headers.get('content-type') || '').not.toContain('text/markdown');
  });
});

describe('conditional requests', () => {
  it('still revalidates a markdown URL', async () => {
    const first = await get('/index.md');
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await get('/index.md', { 'if-none-match': etag });
    expect(second.status).toBe(304);
  });

  it('does not turn a variant switch into a bogus 304', async () => {
    const markdown = await get('/index.md');
    const etag = markdown.headers.get('etag');

    // Same client, now asking for the negotiated page with the markdown etag.
    const negotiated = await get('/', { accept: 'text/markdown', 'if-none-match': etag });
    expect(negotiated.status).toBe(200);
    expect(negotiated.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await negotiated.text()).toMatch(/^# /);

    const html = await get('/', { accept: BROWSER_ACCEPT, 'if-none-match': etag });
    expect(html.status).toBe(200);
    expect(html.headers.get('content-type')).toContain('text/html');
  });
});
