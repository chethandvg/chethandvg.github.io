---
title: "GitHub Pages research site for ₹0, ready for a custom domain"
description: "How one SITE_URL setting drives canonical tags, JSON-LD and dev.to cross-posts on a free Astro site, so a domain move means editing one file."
pubDate: 2026-11-09
tags: [astro, seo, webdev, opensource]
repo: chethandvg.github.io
series: "Frequencies of Life"
draft: true
---

My research project's website costs nothing to run. It lives on GitHub Pages under `chethandvg.github.io`, and one day it will move to a domain of its own. When that day comes, I want the move to mean editing one line in one file, not a weekend of hunting for old links.

That turned out to be a small design rule plus a check that enforces it. This post walks through both.

## The idea

Frequencies of Life is a set of small, open repositories about the rhythms of life. Every claim in each one is labelled: proved, verified, tested, referenced or assumed. The hub site pulls them together, with one page per repository, its claims table, a dependency graph and the posts in this series.

GitHub Pages hosts public repositories for free, with HTTPS included, and GitHub Actions builds them for free too. So the running cost is ₹0. The only cost I expect later is the domain itself.

The catch is that a site's address leaks everywhere. It is in every canonical tag, every Open Graph tag, the sitemap, `robots.txt`, the RSS feed, the JSON-LD and the `canonical_url` of every dev.to cross-post. Hard-code it in a template and a domain switch becomes a search-and-replace across the codebase. Miss one, and search engines see two copies of the same page under two addresses.

So the rule is: **the address is written down once, and everything that is built reads it from there.** It lives in `site.json` in my shared `.github` repository, next to the reusable CI workflows:

```json
{
  "site_url": "https://chethandvg.github.io",
  "previous_hosts": [],
  "owner": "chethandvg",
  "project_path": "/frequencies-of-life"
}
```

(I've trimmed a few fields that don't matter here.)

## The code

### One source of truth for the address

Before every dev or build run, a small script copies `site.json`, the repository registry and each repo's `claims.yaml` into the site. A sibling folder on my machine wins, so I can work offline. Otherwise it reads the file from GitHub:

```js
async function load(repo, file) {
  const local = join(WORKSPACE, repo, file);
  if (existsSync(local)) return readFile(local, 'utf8');
  const url = `${RAW}/${repo}/main/${file}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}
```

Then a single function decides the address. Every script and the Astro config share it, so the rule exists exactly once:

```js
export function resolveSiteUrl(fromSiteJson) {
  const value = process.env.SITE_URL || fromSiteJson;
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`SITE_URL must be an origin such as https://example.org, not "${value}"`);
  }
  return url.origin;
}
```

Two choices are worth explaining. The environment variable wins over the file because CI sets `SITE_URL` from the same `site.json`, and I can also set it by hand to preview the site under another address. And the address must be a bare origin: a path would quietly break every root-relative link on the site, so the build stops instead.

Astro gets the value in one line of `astro.config.mjs`:

```js
  site: siteUrl(),
```

From there, pages read `import.meta.env.SITE`, and a helper turns any path into an absolute URL. No template contains a host name.

### The site-url check

A rule nobody checks is a suggestion. So after every build, `scripts/check-dist.mjs` reads each generated page. Every page must have exactly one canonical link, and it must sit under the current address:

```js
  const canonicals = [...text.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)].map(([tag]) => attr(tag, 'href'));
  if (canonicals.length !== 1) fail(file, `has ${canonicals.length} canonical links`);
  else if (!canonicals[0]?.startsWith(`${SITE}/`)) fail(file, `canonical ${canonicals[0]} is not under ${SITE}`);
```

Every link on the page, every URL inside the JSON-LD and every entry in the sitemap and RSS feed goes through one more test:

```js
  if (url.host !== HOST && url.host.endsWith('github.io')) return fail(file, `links to ${url.host}; the site is ${HOST}`);
  if (url.host !== HOST) return;
  if (RESERVED.some((p) => `${url.pathname}/`.startsWith(p))) return fail(file, `links to reserved path ${url.pathname}`);
  if (!built(url.pathname)) fail(file, `links to ${url.pathname}, which was not built`);
```

The first line catches a stale `github.io` address after a switch. The reserved paths protect two older project sites that already live under my account, which the hub must never shadow. The last line is a free broken-link check for internal pages.

Built pages are only half the story. README files, `CITATION.cff` and package manifests contain the address as plain text, and nothing builds them. For those, a shared `site-url-check` workflow scans every tracked file and fails on any old host. A `switch-domain` script rewrites them across all my local repos in one go.

### JSON-LD for software and datasets

Each repository page describes itself to search engines as schema.org `SoftwareSourceCode`, with its licence as an SPDX URL. Data repositories also get a `Dataset` node, which is what Google Dataset Search reads:

```js
const dataset = (repo) => ({
  '@type': 'Dataset',
  '@id': nodeId(repo.path, 'dataset'),
  name: repo.title,
  description: repo.description,
  url: abs(repo.path),
  sameAs: repo.github,
  license: spdx(repo.content_licence ?? repo.licence),
  creator: author(),
  isAccessibleForFree: true,
  isPartOf: project(),
});

export const repoNodes = (repo) => (isDataset(repo) ? [code(repo), dataset(repo)] : [code(repo)]);
```

Every URL in there comes from `abs()`, so the markup follows the address like everything else. The data repositories carry a CC BY-NC licence while their code is under PolyForm Noncommercial, which is why the dataset prefers `content_licence`.

### Canonical cross-posting to dev.to

Each post appears on the hub first and on dev.to second. dev.to lets a post declare its original home with `canonical_url`. It then adds a canonical link to its copy, pointing back at the hub. `npm run devto` writes that front matter for every post:

```js
  const meta = {
    title: data.title,
    published: false,
    description: data.description,
    tags: data.tags.join(', '),
    series: data.series,
    canonical_url: absolute(SITE, paths.post(id)),
    cover_image: absolute(SITE, paths.og(id)),
  };
```

The cover image is the post's Open Graph image, rendered to a 1200 × 630 PNG at build time with `sharp` from an SVG template. The script also turns root-relative links such as `/frequencies-of-life/` into absolute ones, because a relative link on dev.to would point at dev.to. Code blocks are left alone, so the snippets in this post survive the trip unchanged.

## The evidence

None of this is proved; it is tested. Here is what I ran before writing this.

A normal build, with `SITE_URL` unset, falls back to `site.json`:

```text
check-dist: 11 pages and 10 JSON-LD blocks OK for https://chethandvg.github.io
```

The same build with `SITE_URL=https://example.org` put every canonical URL, the sitemap, `robots.txt` and the RSS feed on `example.org`. A search of the output found no `https://chethandvg.github.io` left anywhere. That is the domain switch, rehearsed.

Then I broke a built page on purpose by adding a second canonical link, a link to a reserved path, a link to another `github.io` site and a link to a missing page. The check reported five problems and exited with status 1. The extra canonical counted twice: once as a duplicate, and once as a link to a page that was never built.

## What this does not show

- The check reads my own generated HTML with regular expressions. That works because I control the markup; it is not a general HTML parser.
- JSON-LD that parses is not necessarily JSON-LD that search engines accept. The check confirms valid JSON with the schema.org context, nothing more; Google's Rich Results Test is the real judge.
- A canonical link is a strong hint, not an order. Search engines decide for themselves which copy to show.
- The `Dataset` markup applies to repositories whose name ends in `-dataset`. That is a naming convention, not a type system.
- The automatic redirect from `github.io` to a custom domain is GitHub's feature, not mine. The plain-text addresses in READMEs still need the rewrite script.

## Try it

The source is at https://github.com/chethandvg/chethandvg.github.io, and the hub page for it is [/frequencies-of-life/repos/chethandvg.github.io/](/frequencies-of-life/repos/chethandvg.github.io/). To rehearse a domain switch yourself:

```bash
npm ci
SITE_URL=https://example.org npm run build
```

Next in the series, I start on the foundations: `rhythm-units`, and the theorem that speeding time up by a factor multiplies every frequency by that same factor.
