/**
 * TriFold Technologies site worker.
 *
 * The site is a set of static files. This worker sits in front of them and
 * adds the three things a static asset server cannot do on its own:
 *
 *   1. Markdown content negotiation. `Accept: text/markdown` returns the
 *      markdown twin of a page (`/services.html` -> `/services.md`).
 *   2. A correct `Vary: Accept, Accept-Encoding` on every negotiated response,
 *      so a CDN never hands the HTML variant to an agent asking for markdown.
 *   3. A 404 that agents can recover from: a short markdown body with links to
 *      the sitemap, llms.txt and the main pages, while browsers keep the
 *      designed 404 page.
 *
 * Everything else is passed straight through to the static assets, so the
 * visual site is byte-for-byte what it was before.
 */

import {
  MARKDOWN_TYPE,
  VARY_VALUE,
  markdownCandidates,
  negotiate,
} from './negotiation.js';

const NOT_FOUND_MARKDOWN = '/404.md';

/** Last-resort 404 body, used only if /404.md is missing from the deployment. */
const FALLBACK_NOT_FOUND_MARKDOWN = `# 404 — Page not found

This URL does not exist on trifoldtechnologies.com.

- [Home](https://trifoldtechnologies.com/)
- [Site map](https://trifoldtechnologies.com/sitemap.xml)
- [llms.txt](https://trifoldtechnologies.com/llms.txt)
`;

const isPageRequest = (method) => method === 'GET' || method === 'HEAD';

const isHtml = (response) =>
  (response.headers.get('content-type') || '').toLowerCase().includes('text/html');

/** Rebuild a response with editable headers (asset headers are immutable). */
function rewrite(source, { status = source.status, headers = {} } = {}) {
  const merged = new Headers(source.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(source.body, { status, statusText: source.statusText, headers: merged });
}

/** HEAD must not carry a body; everything else keeps status and headers. */
function forMethod(method, response) {
  return method === 'HEAD'
    ? new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    : response;
}

/**
 * Fetch one static asset by path, ignoring the query string.
 *
 * Conditional headers are dropped: they were validated against a different
 * representation (the HTML page, or a previous markdown twin), so passing them
 * on could turn a variant swap into a bogus 304.
 */
function fetchAsset(env, request, pathname, method = 'GET') {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';

  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  headers.delete('range');
  headers.delete('if-range');

  return env.ASSETS.fetch(new Request(url, { method, headers }));
}

/** The first markdown twin of `pathname` that actually exists, or null. */
async function findMarkdown(env, request, pathname) {
  for (const candidate of markdownCandidates(pathname)) {
    const response = await fetchAsset(env, request, candidate);
    if (response.ok) return { pathname: candidate, response };
    // Drain the 404 body so the subrequest does not stay open.
    await response.arrayBuffer().catch(() => {});
  }
  return null;
}

/** Does a markdown twin exist, without downloading it? */
async function hasMarkdown(env, request, pathname) {
  for (const candidate of markdownCandidates(pathname)) {
    const probe = await fetchAsset(env, request, candidate, 'HEAD');
    if (probe.ok) return candidate;
  }
  return null;
}

function markdownResponse(source, { status = source.status, contentLocation } = {}) {
  const headers = {
    'content-type': MARKDOWN_TYPE,
    vary: VARY_VALUE,
    'x-content-type-options': 'nosniff',
  };
  if (contentLocation) headers['content-location'] = contentLocation;
  return rewrite(source, { status, headers });
}

async function notFoundResponse(env, request, wantsMarkdown) {
  if (wantsMarkdown) {
    const markdown = await fetchAsset(env, request, NOT_FOUND_MARKDOWN);
    if (markdown.ok) {
      return markdownResponse(markdown, { status: 404, contentLocation: NOT_FOUND_MARKDOWN });
    }
    await markdown.arrayBuffer().catch(() => {});
    return new Response(FALLBACK_NOT_FOUND_MARKDOWN, {
      status: 404,
      headers: {
        'content-type': MARKDOWN_TYPE,
        vary: VARY_VALUE,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  // Browsers keep the designed 404 page. `not_found_handling: "404-page"` in
  // wrangler.jsonc makes the asset server return it with a real 404 status.
  const page = await env.ASSETS.fetch(request);
  return rewrite(page, { status: 404, headers: { vary: VARY_VALUE } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!isPageRequest(request.method)) return env.ASSETS.fetch(request);

    const wants = negotiate(request.headers.get('accept'));
    const candidates = markdownCandidates(url.pathname);

    // A markdown URL asked for directly (/services.md) is still markdown.
    if (url.pathname.endsWith('.md')) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status === 404) {
        await asset.arrayBuffer().catch(() => {});
        return forMethod(request.method, await notFoundResponse(env, request, true));
      }
      return forMethod(request.method, markdownResponse(asset));
    }

    if (wants.markdownPreferred && candidates.length > 0) {
      const found = await findMarkdown(env, request, url.pathname);
      if (found) {
        return forMethod(
          request.method,
          markdownResponse(found.response, { contentLocation: found.pathname }),
        );
      }
    }

    const asset = await env.ASSETS.fetch(request);

    if (asset.status === 404) {
      await asset.arrayBuffer().catch(() => {});
      // Agents (Accept: */* or no Accept at all) get a recoverable markdown
      // body; anything that actually prefers HTML gets the 404 page.
      return forMethod(request.method, await notFoundResponse(env, request, !wants.htmlPreferred));
    }

    if (!isHtml(asset)) return asset;

    // A client that asked for markdown and refuses HTML must not be handed
    // HTML: say so with 406 rather than silently serving the wrong type.
    if (wants.markdownOnly) {
      await asset.arrayBuffer().catch(() => {});
      // The path is echoed back, so keep it to characters that cannot be read
      // as markup by a client that ignores the content type.
      const safePath = url.pathname.replace(/[^\w\-./]/g, '');
      return forMethod(
        request.method,
        new Response(
          `# 406 — No markdown variant\n\n` +
            `\`${safePath}\` has no \`text/markdown\` representation. ` +
            `Retry with \`Accept: text/html\`, or start from ` +
            `[llms.txt](https://trifoldtechnologies.com/llms.txt).\n`,
          {
            status: 406,
            headers: {
              'content-type': MARKDOWN_TYPE,
              vary: VARY_VALUE,
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
            },
          },
        ),
      );
    }

    const twin = await hasMarkdown(env, request, url.pathname);
    const response = rewrite(asset, { headers: { vary: VARY_VALUE } });
    if (twin) {
      response.headers.append('link', `<${twin}>; rel="alternate"; type="text/markdown"`);
    }

    return forMethod(request.method, response);
  },
};
