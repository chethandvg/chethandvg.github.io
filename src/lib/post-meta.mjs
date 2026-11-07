// SPDX-License-Identifier: Apache-2.0
// The post front-matter schema from STYLE.md and the file-name rule. The content
// collection and scripts/devto.mjs both use this module, so they read posts identically.
import { z } from 'astro/zod';

export const POSTS_DIR = 'src/content/posts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A post's id (and URL slug) is its file name without `.md`. */
export function postId(file) {
  const id = file.replace(/\.md$/i, '');
  if (!SLUG.test(id)) throw new Error(`${POSTS_DIR}/${file}: name post files in lowercase words joined by hyphens`);
  return id;
}

export const postSchema = (repoNames) =>
  z.strictObject({
    title: z.string().min(1).max(70),
    description: z.string().min(1).max(155),
    pubDate: z.coerce.date(),
    tags: z.array(z.string().regex(/^[a-z0-9]+$/, 'tags use lowercase letters and digits only')).max(4),
    // Optional: a post about the whole project (such as the series kickoff) names no repo.
    repo: z.enum(repoNames).optional(),
    series: z.string().min(1),
    draft: z.boolean().default(false),
  });
