// SPDX-License-Identifier: Apache-2.0
// schema.org JSON-LD builders. Every URL comes from abs(), so a domain switch needs no edit here.
import { PROFILE, PROJECT, abs, isDataset, isoDate, paths, spdx } from './site.mjs';

const nodeId = (path, fragment) => `${abs(path)}#${fragment}`;

/** Short Person reference for author fields; the full node lives on the home page. */
const author = () => ({ '@type': 'Person', '@id': nodeId(paths.home, 'person'), name: PROFILE.name, url: abs(paths.home) });

const project = () => ({ '@type': 'CreativeWork', '@id': nodeId(paths.project, 'project'), name: PROJECT.name, url: abs(paths.project) });

export const person = () => ({
  ...author(),
  alternateName: PROFILE.alternateName,
  jobTitle: PROFILE.jobTitle,
  knowsAbout: PROFILE.knowsAbout,
  sameAs: [PROFILE.github, PROFILE.linkedin, PROFILE.orcid].filter(Boolean),
});

export const website = () => ({
  '@type': 'WebSite',
  '@id': nodeId(paths.home, 'website'),
  url: abs(paths.home),
  name: PROFILE.name,
  inLanguage: 'en-GB',
  author: author(),
});

export const projectPage = () => ({
  ...project(),
  description: PROJECT.tagline,
  author: author(),
  license: spdx('CC-BY-NC-4.0'),
  inLanguage: 'en-GB',
});

const code = (repo) => ({
  '@type': 'SoftwareSourceCode',
  '@id': nodeId(repo.path, 'code'),
  name: repo.name,
  alternateName: repo.title,
  description: repo.description,
  url: abs(repo.path),
  codeRepository: repo.github,
  license: spdx(repo.licence),
  ...(repo.doi && { identifier: `https://doi.org/${repo.doi}` }),
  author: author(),
  isPartOf: project(),
});

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

export const blogPosting = (post, repo) => ({
  '@type': 'BlogPosting',
  '@id': nodeId(paths.post(post.id), 'post'),
  headline: post.data.title,
  description: post.data.description,
  datePublished: isoDate(post.data.pubDate),
  inLanguage: 'en-GB',
  url: abs(paths.post(post.id)),
  mainEntityOfPage: abs(paths.post(post.id)),
  image: abs(paths.og(post.id)),
  keywords: post.data.tags,
  author: author(),
  publisher: author(),
  license: spdx('CC-BY-NC-4.0'),
  isPartOf: { '@type': 'CreativeWorkSeries', name: post.data.series, url: abs(paths.posts) },
  about: repo ? { '@type': 'SoftwareSourceCode', name: repo.name, codeRepository: repo.github } : project(),
});

export const breadcrumbs = (trail) => ({
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: abs(crumb.path) })),
});

/** One script per page. `<` is escaped so no string can close the script element. */
export const toScript = (nodes) => JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(/</g, '\\u003c');
