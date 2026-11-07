// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { siteUrl } from './scripts/site-config.mjs';

export default defineConfig({
  // The only place the site address enters the build: SITE_URL, else site.json.
  site: siteUrl(),
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
