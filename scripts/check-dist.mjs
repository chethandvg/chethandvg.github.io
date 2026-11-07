// SPDX-License-Identifier: Apache-2.0
// Post-build checks on dist/. Every page needs one canonical URL under SITE_URL, a title and
// a meta description; JSON-LD must parse; no link may point at a reserved project-site path,
// at another *.github.io host or at a page that was not built; sitemap and robots.txt exist.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, siteUrl } from './site-config.mjs';

const SITE = siteUrl();
const HOST = new URL(SITE).host;
const RESERVED = ['/profilescape/', '/vedic-astrology-toolkit/'];
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

const files = readdirSync(DIST, { recursive: true }).map((f) => f.replaceAll('\\', '/')).filter((f) => statSync(join(DIST, f)).isFile());
const built = (pathname) => {
  const p = decodeURIComponent(pathname).replace(/^\//, '');
  return files.includes(p.endsWith('/') || p === '' ? `${p}index.html` : p) || files.includes(`${p}/index.html`);
};
const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const unescape = (s) => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");

/** Hosts, reserved paths and (on our own host) that the target exists in dist/. */
function checkUrl(file, raw, base) {
  let url;
  try {
    url = new URL(unescape(raw), base);
  } catch {
    return;
  }
  if (!/^https?:$/.test(url.protocol)) return;
  if (url.host !== HOST && url.host.endsWith('github.io')) return fail(file, `links to ${url.host}; the site is ${HOST}`);
  if (url.host !== HOST) return;
  if (RESERVED.some((p) => `${url.pathname}/`.startsWith(p))) return fail(file, `links to reserved path ${url.pathname}`);
  if (!built(url.pathname)) fail(file, `links to ${url.pathname}, which was not built`);
}

/** Every string in a JSON-LD tree that looks like a URL. */
const jsonUrls = (node) =>
  typeof node === 'string' ? (/^https?:\/\//.test(node) ? [node] : []) : Object.values(node ?? {}).flatMap(jsonUrls);

for (const dir of RESERVED) if (existsSync(join(DIST, dir))) fail(dir, 'the hub must not build this path');

let pages = 0;
let blocks = 0;
for (const file of files) {
  const text = readFileSync(join(DIST, file), 'utf8');
  if (file.endsWith('.xml')) {
    for (const [, url] of text.matchAll(/<(?:loc|link|guid)[^>]*>([^<]+)</g)) checkUrl(file, url, SITE);
    continue;
  }
  if (!file.endsWith('.html')) continue;
  pages++;
  const base = `${SITE}/${file.replace(/(^|\/)index\.html$/, '$1')}`;

  const canonicals = [...text.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/g)].map(([tag]) => attr(tag, 'href'));
  if (canonicals.length !== 1) fail(file, `has ${canonicals.length} canonical links`);
  else if (!canonicals[0]?.startsWith(`${SITE}/`)) fail(file, `canonical ${canonicals[0]} is not under ${SITE}`);
  if (!/<title>[^<]*\S[^<]*<\/title>/.test(text)) fail(file, 'has no title');
  const description = [...text.matchAll(/<meta\b[^>]*\bname="description"[^>]*>/g)].map(([tag]) => attr(tag, 'content'));
  if (description.length !== 1 || !description[0]?.trim()) fail(file, 'needs exactly one non-empty meta description');

  for (const [, json] of text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    blocks++;
    try {
      const data = JSON.parse(json);
      if (data['@context'] !== 'https://schema.org') fail(file, 'JSON-LD without the schema.org @context');
      for (const url of jsonUrls(data)) checkUrl(file, url, base);
    } catch (err) {
      fail(file, `JSON-LD does not parse: ${err.message}`);
    }
  }
  for (const [tag] of text.matchAll(/<(?:a|link|img|script|source|meta)\b[^>]*>/g)) {
    for (const name of ['href', 'src']) {
      const value = attr(tag, name);
      if (value && !/^(#|mailto:|data:|javascript:)/.test(value)) checkUrl(file, value, base);
    }
    const content = attr(tag, 'content');
    if (content && /^https?:\/\//.test(content)) checkUrl(file, content, base);
  }
}

if (!files.includes('sitemap-index.xml')) fail('sitemap-index.xml', 'missing');
if (!files.includes('robots.txt')) fail('robots.txt', 'missing');
else if (!readFileSync(join(DIST, 'robots.txt'), 'utf8').includes(`Sitemap: ${SITE}/sitemap-index.xml`)) fail('robots.txt', 'does not name the sitemap');

if (errors.length) {
  console.error(`check-dist: ${errors.length} problem(s)\n${errors.map((e) => `  ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-dist: ${pages} pages and ${blocks} JSON-LD blocks OK for ${SITE}`);
