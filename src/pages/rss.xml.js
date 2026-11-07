// SPDX-License-Identifier: Apache-2.0
import rss from '@astrojs/rss';
import { PROFILE, PROJECT, SITE_URL, paths } from '../lib/site.mjs';
import { getPosts } from '../lib/posts.mjs';

export async function GET() {
  const posts = await getPosts();
  return rss({
    title: `${PROJECT.name} · ${PROFILE.name}`,
    description: PROJECT.tagline,
    site: SITE_URL,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: paths.post(post.id),
      categories: post.data.tags,
    })),
    customData: '<language>en-gb</language>',
  });
}
