// SPDX-License-Identifier: Apache-2.0
// Layered layout of the repo dependency graph, computed at build time (no client JS).
// Each registry layer is a band; inside a band a repo sits one row below its deepest
// dependency. Rows are ordered by the barycentre of their neighbours to reduce crossings.
export const NODE = { w: 200, h: 58 };
const GAP_X = 20;
const GAP_Y = 34;
const BAND_HEAD = 28;
const BAND_GAP = 14;
const PAD = 16;
const MAX_CHARS = 24;
const round = (v) => Math.round(v * 10) / 10;

/** Split a long repo name at the hyphen nearest its middle. */
function labelLines(name) {
  if (name.length <= MAX_CHARS) return [name];
  let cut = -1;
  for (let i = name.indexOf('-'); i !== -1; i = name.indexOf('-', i + 1)) {
    if (cut === -1 || Math.abs(i - name.length / 2) < Math.abs(cut - name.length / 2)) cut = i;
  }
  return cut === -1 ? [name] : [name.slice(0, cut + 1), name.slice(cut + 1)];
}

export function layoutGraph(repos, layers) {
  const byName = new Map(repos.map((r) => [r.name, r]));
  const rank = new Map();
  const bands = [];
  let base = 0;

  for (const layer of layers) {
    const members = repos.filter((r) => r.layer === layer.id);
    if (!members.length) continue;
    const visiting = new Set();
    const rankOf = (r) => {
      if (rank.has(r.name)) return rank.get(r.name);
      if (r.layer !== layer.id) throw new Error(`${r.name} is depended on by a lower layer; dependencies must point down or sideways`);
      if (visiting.has(r.name)) throw new Error(`dependency cycle through ${r.name}`);
      visiting.add(r.name);
      const value = Math.max(base, ...r.depends_on.map((d) => rankOf(byName.get(d)) + 1));
      rank.set(r.name, value);
      return value;
    };
    const last = Math.max(...members.map(rankOf));
    bands.push({ ...layer, first: base, last });
    base = last + 1;
  }

  const rows = Array.from({ length: base }, () => []);
  for (const r of repos) rows[rank.get(r.name)].push(r);
  const children = new Map(repos.map((r) => [r.name, []]));
  for (const r of repos) for (const d of r.depends_on) children.get(d).push(r.name);

  const inner = Math.max(...rows.map((row) => row.length)) * (NODE.w + GAP_X) - GAP_X;
  const cx = new Map();
  const place = (row) => {
    const offset = PAD + (inner - (row.length * (NODE.w + GAP_X) - GAP_X)) / 2 + NODE.w / 2;
    row.forEach((r, i) => cx.set(r.name, offset + i * (NODE.w + GAP_X)));
  };
  const sweep = (order, neighbours) => {
    for (const i of order) {
      const centre = new Map(rows[i].map((r) => {
        const xs = neighbours(r).map((n) => cx.get(n));
        return [r.name, xs.length ? xs.reduce((a, b) => a + b) / xs.length : cx.get(r.name)];
      }));
      rows[i].sort((a, b) => centre.get(a.name) - centre.get(b.name));
      place(rows[i]);
    }
  };
  rows.forEach(place);
  const down = rows.map((_, i) => i);
  const up = [...down].reverse();
  for (let k = 0; k < 4; k++) {
    sweep(down, (r) => r.depends_on);
    sweep(up, (r) => children.get(r.name));
  }

  const top = [];
  let y = PAD;
  for (const band of bands) {
    band.y = y;
    y += BAND_HEAD;
    for (let i = band.first; i <= band.last; i++) {
      top[i] = y;
      y += NODE.h + (i < band.last ? GAP_Y : 0);
    }
    band.h = y + 12 - band.y;
    y = band.y + band.h + BAND_GAP;
  }

  const node = (r) => ({ x: cx.get(r.name) - NODE.w / 2, y: top[rank.get(r.name)] });
  const nodes = repos.map((r) => ({ repo: r, ...node(r), lines: labelLines(r.name) }));

  // Spread each node's edge ends across its middle 70 %, ordered by the far end's position.
  const port = (list, name, x) => x + NODE.w * (0.15 + (0.7 * (list.indexOf(name) + 0.5)) / list.length);
  const outs = new Map(repos.map((r) => [r.name, [...children.get(r.name)].sort((a, b) => cx.get(a) - cx.get(b))]));
  const ins = new Map(repos.map((r) => [r.name, [...r.depends_on].sort((a, b) => cx.get(a) - cx.get(b))]));
  const edges = repos.flatMap((r) =>
    r.depends_on.map((d) => {
      const from = node(byName.get(d));
      const to = node(r);
      const x1 = round(port(outs.get(d), r.name, from.x));
      const y1 = from.y + NODE.h;
      const x2 = round(port(ins.get(r.name), d, to.x));
      const y2 = to.y - 3;
      const ym = round((y1 + y2) / 2);
      return { d: `M${x1} ${y1}C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}`, planned: r.status === 'planned' || byName.get(d).status === 'planned' };
    }),
  );

  return { width: inner + 2 * PAD, height: y - BAND_GAP + PAD, bands, nodes, edges };
}
