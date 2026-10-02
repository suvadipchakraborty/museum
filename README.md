# The Daily Artifact

Random artwork from the V&A, The Met, the Art Institute of Chicago, the Smithsonian and the Rijksmuseum, with a Global / India Only toggle.
Vanilla HTML/CSS/JS. No build step. No API keys.

## Deploy (Cloudflare Pages)
1. Push this folder to GitHub.
2. Cloudflare Pages -> Create project -> connect the repo.
3. Build command: *(empty)*. Output directory: `/`.

Serve over HTTPS for the service worker and install prompt. Replace `icons/` and `preview.png` with your own artwork if you like (preview: 1200x630).

## Notes
- If you deploy as a Cloudflare Worker (workers.dev) instead of Pages, use static assets: `npx wrangler deploy --assets=./`.
- Any key placed in client-side JS is public, so this app deliberately uses keyless APIs only.

- Smithsonian uses an API key hard-coded in `app.js` (`SI_KEY`). It is public in the browser, so rotate it and consider proxying via a Worker.
- Rijksmuseum has no India-specific query, so it is skipped in India Only mode.
- Rijksmuseum's search API is in beta and resolves images via a multi-step Linked Art chain; failures are retried silently with another provider.
