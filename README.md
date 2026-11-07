# Chethan Dandebala Venkatarama

**Personal site of Chethan Dandebala Venkatarama and home of the Frequencies of Life project.**

[![CI](https://github.com/chethandvg/chethandvg.github.io/actions/workflows/ci.yml/badge.svg)](https://github.com/chethandvg/chethandvg.github.io/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

Part of **[Frequencies of Life](https://chethandvg.github.io/frequencies-of-life/)**, open code for the rhythms of life in which every claim says how it is known: proved, verified, tested, referenced or assumed.

## Claims and evidence

<!-- claims-table:start -->
_No claims yet._
<!-- claims-table:end -->

Levels: **P** machine-checked proof (Lean 4) · **V** verified numerics · **T** tested · **R** referenced (DOI or PMID) · **M** model assumption.

## Use

A static [Astro](https://astro.build/) site; Node 22.23.4 or later (CI uses Node 24).

```bash
npm ci
npm run dev                  # sync data, then a local dev server
npm run build                # sync data, build dist/, then check it
npx astro preview            # serve the built dist/ locally
npm run devto                # write devto/<slug>.md for every post (gitignored)
SHOW_DRAFTS=1 npm run build  # include posts marked draft: true
```

**The site address.** It is never written into the code. `scripts/sync-data.mjs` runs before every dev and build run and copies `site.json` and `registry.json` from [chethandvg/.github](https://github.com/chethandvg/.github) into `src/data/generated/` (gitignored). It reads the sibling folder `../.github/` when it exists, else raw GitHub `main`. It also collects `claims.yaml` from every repo that is not planned (sibling folder first, then GitHub; a 404 is skipped with a warning). The address is `site_url` from `site.json` unless the `SITE_URL` environment variable is set, which CI does from the same file. Canonical URLs, Open Graph tags, JSON-LD, the sitemap, `robots.txt`, RSS and the dev.to export all derive from it. To preview the site under another address: `SITE_URL=https://example.org npm run build`.

**Posts.** Each post is a Markdown file in `src/content/posts/`, named `<slug>.md`, with the front matter from the series style guide. The build fails if a title is over 70 characters, a description over 155, there are more than four tags, a tag is not lowercase letters and digits, or `repo` (optional) is not a registry name. `npm run devto` adds dev.to front matter (`published: false`, `canonical_url` pointing at the hub page, `cover_image` from the post's generated Open Graph image) and makes root-relative links absolute, leaving code blocks untouched.

**Structure.**

| Path | Contents |
|---|---|
| `scripts/` | `sync-data.mjs`, `check-dist.mjs`, `devto.mjs`, and `site-config.mjs` (the one SITE_URL rule they share with `astro.config.mjs`) |
| `src/lib/` | `routes.mjs` (every URL path), `site.mjs` (registry, repos, proof levels), `jsonld.mjs` (schema.org builders), `graph.mjs` (dependency-graph layout), `og.mjs` (Open Graph PNGs via sharp), `posts.mjs`, `post-meta.mjs` (front-matter schema) |
| `src/pages/` | `/`, `/about/`, `/frequencies-of-life/` with `repos/[repo]/` and `posts/[slug]/`, `/rss.xml`, `/robots.txt`, `/og/…png` |
| `src/components/`, `src/layouts/`, `src/styles/` | Page parts, the shared SEO layout and the light and dark design tokens |

## How it is verified

- **Build:** CI builds every page on every push and pull request, and deploys `main` to GitHub Pages.
- **Built pages:** `scripts/check-dist.mjs` runs after every build. It fails unless every page has one canonical URL under `SITE_URL`, a title and a meta description, all JSON-LD parses, every internal link resolves, no link points to another `*.github.io` host or to the reserved paths `/profilescape/` and `/vedic-astrology-toolkit/`, and the sitemap and `robots.txt` exist.
- **Links:** the site address comes from `site.json` in [chethandvg/.github](https://github.com/chethandvg/.github), and CI fails on links to an old address.

## Cite

If you use this work, please cite it. GitHub's **Cite this repository** button gives APA and BibTeX from [CITATION.cff](CITATION.cff).

## Licence

Code: Apache-2.0 ([LICENSE](LICENSE)). Articles, data and figures: CC BY-NC 4.0 ([LICENSES/CC-BY-NC-4.0.txt](LICENSES/CC-BY-NC-4.0.txt)). The project's music, audio and video are CC BY 4.0; each release states its licence. Copyright notices are in [NOTICE](NOTICE).
