// SPDX-License-Identifier: Apache-2.0
import { ogResponse } from '../../../lib/og.mjs';
import { getPosts } from '../../../lib/posts.mjs';

export async function getStaticPaths() {
  return (await getPosts()).map((post) => ({
    params: { slug: post.id },
    props: { kicker: post.data.series, title: post.data.title },
  }));
}

export const GET = ({ props }) => ogResponse(props);
