/**
 * Measure how green the tessellation palette actually is.
 *
 *   node scripts/measure-palette.mjs
 *
 * Use this when retuning `PALETTE` in vendor-tessellation.mjs — "greener" and
 * "less green" are hard to judge from a still frame, and the scene's colours are
 * mostly the product of a 16-level random walk rather than the root colour, so
 * intuition about the root is misleading.
 *
 * It evaluates the patched functions pulled straight out of the shipped
 * `public/tess/worker.js`, so it measures what actually deploys — not a copy of
 * the patch. (worker.js, not main.js: multithreading is on, so the worker is
 * what generates colours in practice.)
 */

import { readFileSync } from 'node:fs';

const BUNDLE = 'public/tess/worker.js';
const SAMPLES = 6000;
/** Matches Parameters.colorVariation: 255 × the 0–1 slider, default 0.3. */
const VARIATION = 255 * 0.3;
/** Matches the density setting — how many times a primitive subdivides. */
const DEPTH = 16;
/** Hue window counted as "green", in degrees. */
const GREEN = [60, 190];

const src = readFileSync(BUNDLE, 'utf8');

function grab(start, end) {
	const i = src.indexOf(start);
	if (i < 0) throw new Error(`${BUNDLE}: could not find ${start}`);
	const j = src.indexOf(end, i);
	if (j < 0) throw new Error(`${BUNDLE}: could not find ${end}`);
	return src.slice(i, j + end.length);
}

function Color(r, g, b) {
	this.r = r;
	this.g = g;
	this.b = b;
}
// eslint-disable-next-line no-eval
eval(grab('Color.random = function () {', '\n    };'));
// eslint-disable-next-line no-eval
eval(grab('Color.prototype.computeCloseColor = function (colorVariation) {', 'Color.GREEN_ANCHOR_PULL = ') + /GREEN_ANCHOR_PULL = ([0-9.]+)/.exec(src)[1] + ';');

/** Upstream's unmodified behaviour, as the baseline to judge against. */
const upstreamRandom = () =>
	new Color(...[0, 0, 0].map(() => Math.floor(256 * Math.random())));
const upstreamClose = (c, v) =>
	new Color(
		...['r', 'g', 'b'].map((k) => {
			const raw = c[k] + Math.round(v * (Math.random() - 0.5));
			return raw < 0 ? 0 : raw > 255 ? 255 : raw;
		}),
	);

function hue(c) {
	const r = c.r / 255;
	const g = c.g / 255;
	const b = c.b / 255;
	const mx = Math.max(r, g, b);
	const mn = Math.min(r, g, b);
	const d = mx - mn;
	if (d === 0) return null; // greys have no hue
	let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h *= 60;
	return h < 0 ? h + 360 : h;
}

function stats(colors) {
	const hues = colors.map(hue).filter((h) => h !== null);
	hues.sort((a, b) => a - b);
	const green = hues.filter((h) => h >= GREEN[0] && h <= GREEN[1]).length;
	const q = (p) => Math.round(hues[Math.floor(p * (hues.length - 1))]);
	const sat =
		colors.reduce((acc, c) => {
			const mx = Math.max(c.r, c.g, c.b);
			const mn = Math.min(c.r, c.g, c.b);
			return acc + (mx ? (mx - mn) / mx : 0);
		}, 0) / colors.length;
	return { green: (100 * green) / hues.length, q, sat };
}

const drift = (roots, close) =>
	roots.map((c) => {
		let x = c;
		for (let i = 0; i < DEPTH; i++) x = close(x, VARIATION);
		return x;
	});

const ours = Array.from({ length: SAMPLES }, () => Color.random());
const orig = Array.from({ length: SAMPLES }, upstreamRandom);
const oursDrifted = drift(ours, (c, v) => c.computeCloseColor(v));
const origDrifted = drift(orig, upstreamClose);

const row = (label, roots, drifted) => {
	const r = stats(roots);
	const d = stats(drifted);
	console.log(
		`${label.padEnd(22)} ${r.green.toFixed(0).padStart(4)}%  ${d.green.toFixed(0).padStart(5)}%   ` +
			`${String(d.q(0.1)).padStart(3)}/${String(d.q(0.5)).padStart(3)}/${String(d.q(0.9)).padStart(3)}   ${d.sat.toFixed(2)}`,
	);
};

console.log(`green = hue within ${GREEN[0]}–${GREEN[1]}°, ${SAMPLES} samples, depth ${DEPTH}\n`);
console.log('                      roots  drifted   hue p10/50/90   sat');
row('upstream (baseline)', orig, origDrifted);
row('ours (shipped)', ours, oursDrifted);

const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
console.log('\nsamples after drift:', oursDrifted.slice(0, 10).map(hex).join(' '));
