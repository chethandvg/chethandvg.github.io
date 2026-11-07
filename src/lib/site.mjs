// SPDX-License-Identifier: Apache-2.0
// Site data for the pages: the owner, the project, the proof levels and the registry,
// with each repo's links, licences, dependencies and claims resolved once.
import site from '../data/generated/site.json';
import registry from '../data/generated/registry.json';
import claims from '../data/generated/claims.json';
import { absolute, paths } from './routes.mjs';

export { paths, registry, site };

/** Set in astro.config.mjs from SITE_URL or site.json; no page hard-codes the host. */
export const SITE_URL = import.meta.env.SITE.replace(/\/$/, '');
export const abs = (path) => absolute(SITE_URL, path);

export const PROFILE = {
  name: site.author,
  alternateName: site.author_alternate_name,
  jobTitle: 'Software engineer',
  knowsAbout: ['C#', '.NET', 'Azure', 'Applied AI'],
  github: `https://github.com/${site.owner}`,
  linkedin: 'https://www.linkedin.com/in/chethan-d-v-aa4a55174/',
  orcid: site.orcid,
};

export const PROJECT = {
  name: site.series,
  tagline: 'Open, tested code for the rhythms of life, where every claim says how it is known.',
  source: `https://github.com/${site.owner}`,
};

export const CRUMBS = {
  project: { name: PROJECT.name, path: paths.project },
  posts: { name: 'Posts', path: paths.posts },
};

export const LEVELS = [
  { id: 'P', name: 'Proved', text: 'Machine-checked proof in Lean 4 with Mathlib: no sorry, standard axioms only.' },
  { id: 'V', name: 'Verified', text: 'Verified numerics: interval arithmetic or an exhaustive check.' },
  { id: 'T', name: 'Tested', text: 'Property tests plus shared golden vectors, identical in every language.' },
  { id: 'R', name: 'Referenced', text: 'An empirical fact with its DOI, species and method; never called proved.' },
  { id: 'M', name: 'Model assumption', text: 'Stated explicitly as an assumption; never presented as fact.' },
];
export const level = (id) => LEVELS.find((l) => l.id === id);

const layerIds = Object.keys(registry.layers).sort((a, b) => (a === 'meta' ? -1 : b === 'meta' ? 1 : a - b));

export const spdx = (id) => `https://spdx.org/licenses/${id}.html`;

export const repos = registry.repos.map((r) => ({
  ...r,
  path: r.status === 'planned' ? null : paths.repo(r.name),
  github: `https://github.com/${site.owner}/${r.name}`,
  licences: [r.licence, r.content_licence].filter(Boolean),
  layerLabel: r.layer === 'meta' ? 'Meta' : `Layer ${r.layer}`,
  ledger: r.name in claims,
  claims: claims[r.name]?.claims ?? [],
}));
const byName = new Map(repos.map((r) => [r.name, r]));
for (const r of repos) {
  r.deps = r.depends_on.map((name) => byName.get(name));
  r.usedBy = repos.filter((other) => other.depends_on.includes(r.name));
}
export const repo = (name) => byName.get(name);

export const layers = layerIds.map((id) => ({
  id,
  label: id === 'meta' ? 'Meta' : `Layer ${id}`,
  text: registry.layers[id],
  repos: repos.filter((r) => r.layer === id),
}));

/** Data repos also get schema.org Dataset markup, so Google Dataset Search can list them. */
export const isDataset = (r) => r.name.endsWith('-dataset');

export const formatDate = (date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const isoDate = (date) => date.toISOString().slice(0, 10);
