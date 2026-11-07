// SPDX-License-Identifier: Apache-2.0
import { getCollection } from 'astro:content';

const SHOW_DRAFTS = process.env.SHOW_DRAFTS === '1';
const byDate = (a, b) => a.data.pubDate - b.data.pubDate || a.id.localeCompare(b.id);

let cached;

/** Published posts, newest first; loaded once per build. Drafts appear only when SHOW_DRAFTS=1. */
export function getPosts() {
  cached ??= getCollection('posts', ({ data }) => SHOW_DRAFTS || !data.draft).then((posts) => posts.sort((a, b) => byDate(b, a)));
  return cached;
}

/** Previous and next posts in the same series, by publication date. */
export function seriesNav(posts, post) {
  const series = posts.filter((p) => p.data.series === post.data.series).sort(byDate);
  const i = series.indexOf(post);
  return { prev: series[i - 1], next: series[i + 1], position: i + 1, total: series.length };
}
