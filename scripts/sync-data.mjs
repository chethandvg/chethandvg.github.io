// SPDX-License-Identifier: Apache-2.0
// Gather the shared project data into src/data/generated/ before every dev or build run.
// A sibling folder in the local workspace wins (fast, works offline); otherwise the file
// comes from the repo's main branch on GitHub.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { GENERATED, ROOT, resolveSiteUrl } from './site-config.mjs';
import { PROJECT_PATH } from '../src/lib/routes.mjs';

const WORKSPACE = resolve(ROOT, '..');
const RAW = 'https://raw.githubusercontent.com/chethandvg';
const LEVELS = new Set(['P', 'V', 'T', 'R', 'M']);

/** Text of `repo/file` from the local sibling folder or GitHub main; null on a 404. */
async function load(repo, file) {
  const local = join(WORKSPACE, repo, file);
  if (existsSync(local)) return readFile(local, 'utf8');
  const url = `${RAW}/${repo}/main/${file}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function required(repo, file) {
  const text = await load(repo, file);
  if (text === null) throw new Error(`${repo}/${file} was not found locally or on GitHub`);
  return JSON.parse(text);
}

const [site, registry] = await Promise.all([required('.github', 'site.json'), required('.github', 'registry.json')]);
site.site_url = resolveSiteUrl(site.site_url);

if (site.project_path && site.project_path.replace(/\/$/, '') !== PROJECT_PATH) {
  throw new Error(`site.json project_path is ${site.project_path}, but the pages live under ${PROJECT_PATH}; move src/pages and src/lib/routes.mjs together`);
}

const names = new Set();
for (const repo of registry.repos) {
  if (names.has(repo.name)) throw new Error(`registry.json lists ${repo.name} twice`);
  if (!(repo.layer in registry.layers)) throw new Error(`registry.json: ${repo.name} has unknown layer ${repo.layer}`);
  names.add(repo.name);
}
for (const repo of registry.repos) {
  for (const dep of repo.depends_on) if (!names.has(dep)) throw new Error(`registry.json: ${repo.name} depends on unknown repo ${dep}`);
}

const ledgers = await Promise.all(
  registry.repos
    .filter((repo) => repo.status !== 'planned')
    .map(async ({ name }) => {
      const text = await load(name, 'claims.yaml');
      if (text === null) {
        console.warn(`sync-data: warning: ${name} has no claims.yaml (404); skipped`);
        return null;
      }
      const claims = parse(text)?.claims ?? [];
      for (const c of claims) if (!LEVELS.has(c.level)) console.warn(`sync-data: warning: ${name} claim ${c.id} has unknown level ${c.level}`);
      return [name, { claims }];
    }),
);
const claims = Object.fromEntries(ledgers.filter(Boolean));

await mkdir(GENERATED, { recursive: true });
await Promise.all(
  Object.entries({ site, registry, claims }).map(([name, data]) =>
    writeFile(join(GENERATED, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`),
  ),
);
console.log(`sync-data: ${site.site_url}; ${registry.repos.length} repos; claims ledgers from ${Object.keys(claims).length}`);
