// SPDX-License-Identifier: Apache-2.0
// Every URL path the site serves, in one place. Plain JavaScript, so the Node scripts
// (sync-data, devto) build exactly the same paths as the pages.
export const PROJECT_PATH = '/frequencies-of-life';

/** The GitHub Pages artifact upload leaves out `.github` folders, so leading dots are dropped. */
export const repoSlug = (name) => name.replace(/^\.+/, '');

export const paths = {
  home: '/',
  about: '/about/',
  project: `${PROJECT_PATH}/`,
  posts: `${PROJECT_PATH}/posts/`,
  post: (slug) => `${PROJECT_PATH}/posts/${slug}/`,
  repo: (name) => `${PROJECT_PATH}/repos/${repoSlug(name)}/`,
  og: (slug) => (slug ? `/og/posts/${slug}.png` : '/og/default.png'),
  rss: '/rss.xml',
  sitemap: '/sitemap-index.xml',
};

export const absolute = (siteUrl, path) => new URL(path, siteUrl).href;
