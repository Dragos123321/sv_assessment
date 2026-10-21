// Generates src/theme-dark.css from the light theme in src/styles.css.
//
// The light stylesheet uses literal colours, so instead of hand-maintaining a
// parallel dark stylesheet, every colour declaration is re-emitted under
// :root[data-theme='dark'] with its colours remapped in OKLCH:
//   - text gets light, surfaces get dark, borders get subtle;
//   - saturated mid-tone fills (primary/danger buttons) and white text on them
//     are kept, as is the sidebar, which is already dark.
// Every colour-related declaration is re-emitted (even without a hex value) so
// the relative cascade between light rules is preserved.
// Hand-tuned overrides live in src/theme-dark-overrides.css.
//
// Usage: npm run theme:dark  (rerun after changing colours in styles.css)
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/styles.css';
const TARGET = 'src/theme-dark.css';
const DARK = ":root[data-theme='dark']";
// Rules that style the already-dark sidebar keep their light-theme colours.
const SIDEBAR =
  /\.(sidebar|brand|firm-icon|workspace-label|workspace-badge|nav-item|nav-caption|nav-dot|local-card|local-icon|profile|avatar|help-button)\b/;
const COLOR_PROPS =
  /^(color|accent-color|outline(-color)?|box-shadow|background(-color|-image)?|border(-(top|right|bottom|left|block|inline|color))?|--(ink|muted|border|accent|green))$/;

function hexToRgba(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return { rgb, alpha: h.length === 8 ? h.slice(6) : '' };
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function toOklch(rgb) {
  const [r, g, b] = rgb.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function fromOklch([L, C, H]) {
  const A = C * Math.cos(H),
    B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, gamma(Math.max(0, c)))));
}
const toHex = (rgb) =>
  '#' +
  rgb
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Near-neutral greys get the same cool tint as the light theme's ink.
const tint = ([L, C, H]) => (C < 0.012 ? [L, 0.012, 4.55] : [L, C, H]);

function remap(hex, role) {
  const { rgb, alpha } = hexToRgba(hex);
  const [L, C, H] = toOklch(rgb);
  const fill = C > 0.07 && L > 0.35 && L < 0.75;
  let next;
  if (role === 'shadow') return hex;
  if (role === 'text') {
    if (L > 0.97) return hex; // white text sits on saturated fills
    next = [clamp(1.12 - 0.8 * L, 0.72, 0.94), Math.min(C, 0.12), H];
  } else if (role === 'border') {
    if (fill) return hex;
    next = [clamp(0.3 + (1 - L) * 0.8, 0.3, 0.5), C * 0.7, H];
  } else {
    // surface
    if (fill || L < 0.6) return hex;
    next = [0.235 + (1 - L) * 0.85, C * 0.6, H];
  }
  next = tint(next);
  return toHex(fromOklch(next)) + alpha;
}
function roleOf(prop) {
  if (prop === 'box-shadow') return 'shadow';
  if (/^(color|--ink|--muted|--accent|--green)$/.test(prop)) return 'text';
  if (/^(border|outline|--border)/.test(prop)) return 'border';
  if (prop === 'accent-color') return 'border';
  return 'surface';
}

function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const head = buf.trim();
      buf = '';
      if (head.startsWith('@')) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf('}', i);
      const decls = css
        .slice(i + 1, end)
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const idx = d.indexOf(':');
          return [d.slice(0, idx).trim(), d.slice(idx + 1).trim()];
        });
      out.push({ at: [...stack], selector: head, decls });
      i = end;
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else buf += ch;
  }
  return out;
}
const prefix = (selector) =>
  selector
    .split(',')
    .map((s) => s.trim())
    .map((s) => (s.startsWith(':root') ? DARK + s.slice(5) : `${DARK} ${s}`))
    .join(',\n');

const blocks = [];
for (const rule of parse(readFileSync(SOURCE, 'utf8'))) {
  if (SIDEBAR.test(rule.selector)) continue;
  if (rule.at.some((a) => !a.startsWith('@media'))) continue;
  const decls = rule.decls
    .filter(([prop]) => COLOR_PROPS.test(prop))
    .map(([prop, value]) => {
      const role = roleOf(prop);
      const hexed = value
        .replace(/\bwhite\b/g, '#ffffff')
        .replace(/\bblack\b/g, '#000000');
      return `  ${prop}: ${hexed.replace(/#[0-9a-f]{3,8}\b/gi, (hex) => remap(hex, role))};`;
    });
  if (!decls.length) continue;
  let block = `${prefix(rule.selector)} {\n${decls.join('\n')}\n}`;
  for (const at of [...rule.at].reverse()) block = `${at} {\n${block}\n}`;
  blocks.push(block);
}
writeFileSync(
  TARGET,
  `/* Generated by scripts/dark-theme.mjs from ${SOURCE}. Do not edit; put\n   hand-tuned dark styles in theme-dark-overrides.css. */\n` +
    blocks.join('\n') +
    '\n',
);
console.log(`Wrote ${blocks.length} rules to ${TARGET}`);
