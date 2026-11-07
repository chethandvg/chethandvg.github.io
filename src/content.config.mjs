// SPDX-License-Identifier: Apache-2.0
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import registry from './data/generated/registry.json';
import { POSTS_DIR, postId, postSchema } from './lib/post-meta.mjs';

export const collections = {
  posts: defineCollection({
    loader: glob({ pattern: '*.md', base: `./${POSTS_DIR}`, generateId: ({ entry }) => postId(entry) }),
    schema: postSchema(registry.repos.map((repo) => repo.name)),
  }),
};
