// SPDX-License-Identifier: Apache-2.0
import { abs, paths } from '../lib/site.mjs';

export const GET = () =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${abs(paths.sitemap)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
