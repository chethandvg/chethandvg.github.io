// SPDX-License-Identifier: Apache-2.0
// Where the generated data lives and how the site address is resolved. astro.config.mjs
// and every script import this, so the SITE_URL rule exists in one place only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const GENERATED = fileURLToPath(new URL('../src/data/generated/', import.meta.url));
export const DIST = fileURLToPath(new URL('../dist/', import.meta.url));

export function readGenerated(name) {
  try {
    return JSON.parse(readFileSync(`${GENERATED}${name}.json`, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`src/data/generated/${name}.json is missing: run "npm run sync" first.`);
    throw err;
  }
}

/** The SITE_URL environment variable wins over site.json. The result is a bare origin. */
export function resolveSiteUrl(fromSiteJson) {
  const value = process.env.SITE_URL || fromSiteJson;
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`SITE_URL must be an origin such as https://example.org, not "${value}"`);
  }
  return url.origin;
}

export const siteUrl = () => resolveSiteUrl(readGenerated('site').site_url);
