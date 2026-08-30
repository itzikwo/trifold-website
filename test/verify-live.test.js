/**
 * Runs the post-deploy check list (tools/verify-live.mjs) against this build,
 * so `npm run verify:live` is known to assert the right things before anyone
 * points it at a real deployment.
 */
import { exports as workerExports } from 'cloudflare:workers';
import { expect, it } from 'vitest';

import { PAGES, runChecks } from '../tools/verify-live.mjs';

it('passes every live check against the worker', async () => {
  const results = await runChecks('https://trifoldtechnologies.com/', (url, init) =>
    workerExports.default.fetch(new Request(url, init)),
  );

  const failed = results.filter((result) => !result.ok);
  expect(failed.map((result) => `${result.name} — ${result.detail}`)).toEqual([]);
  expect(results.length).toBeGreaterThanOrEqual(PAGES.length + 8);
});

it('fails loudly when a deployment is wrong', async () => {
  // A host that answers everything with an HTML 200 — the "app shell" 404
  // pattern the audit warns about — must not pass.
  const results = await runChecks('https://example.test/', async () =>
    new Response('<html><body>whatever</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  );

  const failed = results.filter((result) => !result.ok);
  expect(failed.map((result) => result.name)).toContain('an unknown path returns a real 404');
  expect(failed.map((result) => result.name)).toContain('/ negotiates markdown');
});
