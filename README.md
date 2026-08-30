# TriFold Technologies — website

Static site for TriFold Technologies (fractional Chief AI Officer), deployed to
Cloudflare Workers with static assets. A small worker sits in front of the files
to serve markdown to AI agents and to keep the 404 useful.

## Project structure

```
index.html, services.html, about.html, contact.html   # the site
privacy.html, terms.html, accessibility.html, 404.html
ai-strategy-playbook/                                 # Hebrew executive playbook + templates
*.md                                                  # generated markdown twin of each page
llms.txt                                              # what TriFold does and when an agent should use it
robots.txt, sitemap.xml                               # crawler policy and URL index
src/index.js                                          # worker: content negotiation, Vary, agent-readable 404
src/negotiation.js                                    # Accept parsing and page -> markdown mapping
tools/build-markdown.mjs                              # regenerates the markdown twins from the HTML
test/                                                 # vitest suite, runs in the Workers runtime
_redirects, wrangler.jsonc, .assetsignore             # routing and deployment config
admin.html, admin/, content.json                      # local-only draft editor (not deployed, see .assetsignore)
```

## Local development

```bash
npm install
npm run dev      # wrangler dev — the site plus the worker, on localhost
npm test         # markdown drift check + vitest (workerd, real static assets)
```

## Checking a deployment

`npm test` proves the code is right; it says nothing about what is actually
live. After a deploy, check the running site:

```bash
npm run verify:live                                    # https://trifoldtechnologies.com
npm run verify:live -- https://<branch>.workers.dev    # a preview deployment
```

It walks the site as an agent would — markdown negotiation and `Vary` on every
page, a real 404 with a recoverable markdown body, llms.txt, robots.txt,
JSON-LD, and every URL in the sitemap — prints a line per check and exits
non-zero if any fail, so it works as a post-deploy gate. The same check list
runs against the worker in `npm test`, so the checks themselves stay honest.

## Editing content

Edit the HTML page, then regenerate its markdown twin:

```bash
npm run build:markdown
```

`npm test` fails if a `.md` file no longer matches its `.html` source, so the two
never drift. `ai-strategy-playbook/index.md` is the one exception: it is a curated
Hebrew summary maintained by hand, because the playbook page has no `<main>` and a
full transcription helps nobody.

The admin dashboard is a client-side draft editor with no server component, so it
is not deployed. Run it locally:

```bash
python3 -m http.server 8000   # then open http://localhost:8000/admin.html
```

## How the site serves agents

- **Markdown content negotiation.** `Accept: text/markdown` on any page returns
  its markdown twin (`/services.html` → `/services.md`) with
  `Content-Type: text/markdown; charset=utf-8`, `Content-Location`, and
  `Vary: Accept, Accept-Encoding`. HTML clients are unaffected — a browser's
  `Accept` ranks `text/html` above markdown, so it still gets the designed page.
  A client that asks only for markdown on a page with no twin gets a 406 rather
  than the wrong media type.
- **`Vary: Accept, Accept-Encoding`** on every negotiated response, so a CDN
  cannot hand the cached HTML variant to an agent asking for markdown.
- **Recoverable 404s.** Unknown paths return a real HTTP 404. Browsers get the
  designed 404 page; clients that do not insist on HTML get a short markdown
  body with links to the home page, the sitemap and llms.txt.
- **[llms.txt](llms.txt)** describes what TriFold does, the jobs it is the right
  call for, the ones it is not, and the single action an agent should take
  (the booking link). It is linked from robots.txt and the sitemap.
- **JSON-LD** (`Organization`/`ProfessionalService`, `Person`, `WebSite`,
  `OfferCatalog`, `HowTo`) is embedded in the head of the main pages.
- **robots.txt** allows live AI agents and AI search crawlers (ClaudeBot,
  Claude-User, Claude-SearchBot, ChatGPT-User, OAI-SearchBot, PerplexityBot,
  Perplexity-User) and keeps the existing `ai-train=no` reservation for
  training crawlers.

## Deployment

Cloudflare Workers, configured in `wrangler.jsonc`:

```bash
npm run deploy   # wrangler deploy
```

`assets.directory` is the repository root, so `.assetsignore` decides what stays
private. Anything not listed there is published — check it before adding files.

## Contact

**Itzik Woda** | TriFold Technologies
- 052-8544775
- itzik.woda@trifoldtechnologies.com
