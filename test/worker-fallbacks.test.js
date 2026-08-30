/**
 * Edge cases that the real site cannot produce, because every page currently
 * has a markdown twin and /404.md is always deployed. They are exercised
 * against a stub asset server so the behaviour stays covered if that changes.
 */
import { describe, expect, it } from 'vitest';

import worker from '../src/index.js';

const SITE = 'https://trifoldtechnologies.com';

/** An asset server that only knows about the paths it is given. */
function stubAssets(files) {
  return {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const file = files[pathname];
      if (!file) return new Response('missing', { status: 404 });
      return new Response(request.method === 'HEAD' ? null : file.body, {
        status: 200,
        headers: { 'content-type': file.type },
      });
    },
  };
}

const call = (path, headers, env) =>
  worker.fetch(new Request(`${SITE}${path}`, { headers }), env);

describe('a page with no markdown twin', () => {
  const env = {
    ASSETS: stubAssets({
      '/orphan.html': { type: 'text/html; charset=utf-8', body: '<h1>Orphan</h1>' },
    }),
  };

  it('answers 406 when the client refuses HTML', async () => {
    const response = await call('/orphan.html', { accept: 'text/markdown' }, env);
    expect(response.status).toBe(406);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
    expect(await response.text()).toContain('/orphan.html');
  });

  it('still serves HTML when the client accepts it', async () => {
    const response = await call(
      '/orphan.html',
      { accept: 'text/markdown, text/html;q=0.9' },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('vary')).toBe('Accept, Accept-Encoding');
    expect(response.headers.get('link')).toBeNull();
  });
});

describe('when /404.md is not deployed', () => {
  const env = { ASSETS: stubAssets({}) };

  it('falls back to a built-in markdown 404', async () => {
    const response = await call('/missing', { accept: '*/*' }, env);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');

    const body = await response.text();
    expect(body).toContain('# 404 — Page not found');
    expect(body).toContain(`${SITE}/sitemap.xml`);
    expect(body).toContain(`${SITE}/llms.txt`);
  });
});

describe('worker-generated bodies', () => {
  const env = {
    ASSETS: stubAssets({
      '/orphan.html': { type: 'text/html; charset=utf-8', body: '<h1>Orphan</h1>' },
    }),
  };

  it('never lets a client sniff a generated body as HTML', async () => {
    const notFound = await call('/missing', { accept: '*/*' }, env);
    expect(notFound.headers.get('x-content-type-options')).toBe('nosniff');

    const notAcceptable = await call('/orphan.html', { accept: 'text/markdown' }, env);
    expect(notAcceptable.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not echo markup from the request path into a 406', async () => {
    const hostile = '/x<img src=x>.html';
    const normalised = new URL(`${SITE}${hostile}`).pathname;
    const response = await call(
      hostile,
      { accept: 'text/markdown' },
      { ASSETS: stubAssets({ [normalised]: { type: 'text/html', body: 'x' } }) },
    );

    expect(response.status).toBe(406);
    const body = await response.text();
    expect(body).not.toContain('<');
    expect(body).not.toContain('>');
    expect(body).not.toContain('%');
    expect(body).toContain('has no `text/markdown` representation');
  });
});
