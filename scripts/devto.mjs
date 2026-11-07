// SPDX-License-Identifier: Apache-2.0
// Write devto/<slug>.md (gitignored) for every post: dev.to front matter with a canonical_url
// pointing at the hub, and the body with root-relative links and images made absolute.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ROOT, readGenerated, siteUrl } from './site-config.mjs';
import { POSTS_DIR, postId, postSchema } from '../src/lib/post-meta.mjs';
import { absolute, paths } from '../src/lib/routes.mjs';

const SITE = siteUrl();
const OUT = join(ROOT, 'devto');
const schema = postSchema(readGenerated('registry').repos.map((r) => r.name));
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
// Fenced code and inline code are matched first and kept as they are; otherwise a link
// prefix (`](`, `href="`, `src="`, or a reference definition) followed by `/` is rewritten.
const LINK = /(^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\2[ \t]*$)|(`+)[^`\n][^\n]*?\3|(\]\(\s*<?|\b(?:href|src)=["']|^ {0,3}\[[^\]\n]+\]:[ \t]*<?)\/(?!\/)/gm;

export const absoluteLinks = (body) => body.replace(LINK, (match, _fence, _f, _tick, prefix) => (prefix ? `${prefix}${SITE}/` : match));

const files = (await readdir(join(ROOT, POSTS_DIR))).filter((f) => f.endsWith('.md'));
await mkdir(OUT, { recursive: true });
for (const file of files) {
  const text = await readFile(join(ROOT, POSTS_DIR, file), 'utf8');
  const front = FRONT.exec(text);
  if (!front) throw new Error(`${POSTS_DIR}/${file}: no front matter`);
  const id = postId(file);
  const data = schema.parse(parse(front[1]));
  const meta = {
    title: data.title,
    published: false,
    description: data.description,
    tags: data.tags.join(', '),
    series: data.series,
    canonical_url: absolute(SITE, paths.post(id)),
    cover_image: absolute(SITE, paths.og(id)),
  };
  const yaml = Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`).join('\n');
  await writeFile(join(OUT, `${id}.md`), `---\n${yaml}\n---\n\n${absoluteLinks(text.slice(front[0].length)).trimStart()}`);
  console.log(`devto: devto/${id}.md${data.draft ? ' (draft on the hub)' : ''}`);
}
console.log(`devto: ${files.length} post(s) exported for ${SITE}`);
