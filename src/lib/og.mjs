// SPDX-License-Identifier: Apache-2.0
// Open Graph images: an SVG template rendered to a 1200 × 630 PNG with sharp at build time.
import sharp from 'sharp';
import { PROFILE, SITE_URL } from './site.mjs';

const FONT = "'DejaVu Sans', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const escape = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Greedy word wrap; the last line ends in an ellipsis if the text does not fit. */
function wrap(text, maxChars, maxLines) {
  const lines = [];
  for (const word of text.split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1).trimEnd()}…`;
  return kept;
}

// Three summed sines: the series motif, drawn once and reused by every image.
const WAVE = Array.from({ length: 121 }, (_, i) => {
  const x = i * 10;
  const y = 520 + 34 * Math.sin(x / 70) + 14 * Math.sin(x / 23 + 1) + 6 * Math.sin(x / 9);
  return `${i ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
}).join('');

export function ogSvg({ title, kicker }) {
  const lines = wrap(title, 26, 3);
  const size = lines.length > 2 ? 62 : 70;
  const text = lines
    .map((line, i) => `<tspan x="80" dy="${i ? size * 1.15 : 0}">${escape(line)}</tspan>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#121418"/>
  <path d="${WAVE}" fill="none" stroke="#8db8f2" stroke-width="3" opacity="0.55"/>
  <path d="${WAVE}" fill="none" stroke="#6fcf97" stroke-width="2" opacity="0.35" transform="translate(0 26)"/>
  <text x="80" y="118" fill="#8db8f2" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="2">${escape(kicker.toUpperCase())}</text>
  <text x="80" y="${lines.length > 2 ? 210 : 240}" fill="#f2f0eb" font-family="${FONT}" font-size="${size}" font-weight="700">${text}</text>
  <text x="80" y="596" fill="#a6a6b0" font-family="${FONT}" font-size="26">${escape(`${PROFILE.name} · ${new URL(SITE_URL).host}`)}</text>
</svg>`;
}

export async function ogResponse(options) {
  const png = await sharp(Buffer.from(ogSvg(options))).png().toBuffer();
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
