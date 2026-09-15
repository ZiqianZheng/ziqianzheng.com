/**
 * Re-vendor the tessellation renderer from upstream and re-apply our patches.
 *
 *   node scripts/vendor-tessellation.mjs
 *
 * Run this by hand when upstream changes — it is deliberately NOT part of the
 * build, so a network hiccup can never break a deploy. Its whole purpose is that
 * our modifications to someone else's bundle are written down and reproducible
 * rather than hand-edited into a 175 KB file and forgotten.
 *
 * Engine: tessellation-webgl by Jérémie Piellard (MIT, © 2021).
 * https://github.com/piellardj/tessellation-webgl
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REF = 'main';
const RAW = `https://raw.githubusercontent.com/piellardj/tessellation-webgl/${REF}`;
const OUT = path.resolve('public/tess');

/**
 * Palette tuning. These are the only numbers worth touching to change how green
 * the scene reads; re-run the script after editing.
 *
 *   HUE_SPREAD   0 = every root is pure green, 180 = upstream's uniform random.
 *                Hue is drawn from a *triangular* distribution peaking on green,
 *                so this is the half-width of the tail, not a hard boundary —
 *                greens stay the most common hue at any setting.
 *   ANCHOR_PULL  0 = colours drift freely as upstream (any bias washes out over
 *                ~16 subdivisions), 0.13+ = tightly held to the anchor.
 *
 * Current values sit deliberately between "all green" and upstream's free-for-all:
 * green dominates, but oranges, teals and blues still turn up.
 */
const PALETTE = {
	GREEN_HUE: 120,
	HUE_SPREAD: 132,
	SAT_MIN: 0.28,
	SAT_RANGE: 0.57,
	LIGHT_MIN: 0.32,
	LIGHT_RANGE: 0.28,
	ANCHOR: { r: 74, g: 132, b: 84 },
	ANCHOR_PULL: 0.055,
};

const CREDIT = `/*!
 * tessellation-webgl — iterative tessellation renderer.
 * Copyright (c) 2021 Jeremie Piellard. Released under the MIT License.
 * Source: https://github.com/piellardj/tessellation-webgl
 * Full licence text: /tess/LICENSE
 *
 * Vendored and modified — see design/tessellation.md. Modifications:
 *   1. Worker and shader URLs made absolute so they resolve from any route.
 *   2. Palette anchored to green (Color.random + Color.computeCloseColor).
 */
`;

/** Replace exactly once, and fail loudly if upstream has moved. */
function sub(source, find, replace, label) {
	const parts = source.split(find);
	if (parts.length === 1) throw new Error(`patch "${label}": pattern not found`);
	if (parts.length > 2) throw new Error(`patch "${label}": matched ${parts.length - 1}×, expected 1`);
	return parts.join(replace);
}

/**
 * Both URLs are resolved against the *document*, not the script, so left
 * relative they 404 on every route except `/`.
 */
function patchPaths(src) {
	src = sub(src, '"script/worker.js?v="', '"/tess/worker.js?v="', 'worker url');
	src = sub(src, '"./shaders/"', '"/tess/shaders/"', 'shader url');
	return src;
}

/**
 * Bias the palette toward green while keeping the variety intact.
 *
 * Upstream picks a uniformly random RGB root, then each subdivision level
 * random-walks every channel by up to ±(colorVariation/2) — ±38 at the default
 * setting. That walk is what produces the variety, but over ~16 levels it drifts
 * anywhere in the cube, so biasing only the root would not tint the scene at all.
 *
 * So we do two things:
 *   1. Draw root hues from a triangular distribution peaking on green, rather
 *      than sampling the RGB cube uniformly. Triangular, not a hard wedge:
 *      green is merely the most likely hue, and the tails still reach orange
 *      and blue, which is what keeps the scene from reading as monochrome.
 *   2. Add gentle mean-reversion to the walk, so the bias survives deep
 *      subdivision instead of washing out — but weakly enough that colours
 *      still travel a long way from where they started.
 *
 * See PALETTE above for the numbers.
 */
function patchPalette(src) {
	const P = PALETTE;

	const randomBefore = `    Color.random = function () {
        return new Color(Color.randomChannel(), Color.randomChannel(), Color.randomChannel());
    };`;

	const randomAfter = `    Color.random = function () {
        var spread = (Math.random() + Math.random() - 1) * ${P.HUE_SPREAD};
        var h = ((((${P.GREEN_HUE} + spread) % 360) + 360) % 360) / 360;
        var s = ${P.SAT_MIN} + Math.random() * ${P.SAT_RANGE};
        var l = ${P.LIGHT_MIN} + Math.random() * ${P.LIGHT_RANGE};
        var q = (l < 0.5) ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        var channel = function (t) {
            if (t < 0) { t += 1; } else if (t > 1) { t -= 1; }
            if (t < 1 / 6) { return p + (q - p) * 6 * t; }
            if (t < 1 / 2) { return q; }
            if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
            return p;
        };
        return new Color(
            Math.round(255 * channel(h + 1 / 3)),
            Math.round(255 * channel(h)),
            Math.round(255 * channel(h - 1 / 3))
        );
    };`;

	const closeBefore = `    Color.prototype.computeCloseColor = function (colorVariation) {
        return new Color(Color.computeCloseChannelValue(this.r, colorVariation), Color.computeCloseChannelValue(this.g, colorVariation), Color.computeCloseChannelValue(this.b, colorVariation));
    };`;

	const closeAfter = `    Color.prototype.computeCloseColor = function (colorVariation) {
        var anchor = Color.GREEN_ANCHOR;
        var pull = Color.GREEN_ANCHOR_PULL;
        var step = function (value, target) {
            var raw = value + colorVariation * (Math.random() - 0.5);
            raw += (target - raw) * pull;
            if (raw < 0) { return 0; }
            if (raw > 255) { return 255; }
            return Math.round(raw);
        };
        return new Color(step(this.r, anchor.r), step(this.g, anchor.g), step(this.b, anchor.b));
    };
    Color.GREEN_ANCHOR = { r: ${P.ANCHOR.r}, g: ${P.ANCHOR.g}, b: ${P.ANCHOR.b} };
    Color.GREEN_ANCHOR_PULL = ${P.ANCHOR_PULL};`;

	src = sub(src, randomBefore, randomAfter, 'Color.random');
	src = sub(src, closeBefore, closeAfter, 'computeCloseColor');
	return src;
}

async function get(file) {
	const res = await fetch(`${RAW}/${file}`);
	if (!res.ok) throw new Error(`GET ${file} → ${res.status}`);
	return res.text();
}

await mkdir(path.join(OUT, 'shaders'), { recursive: true });

// main.js drives the page; worker.js carries its own copy of the engine and,
// because multithreading is on, is the one that actually generates the colours.
// Both need the palette patch; only main.js has the URLs.
const main = patchPalette(patchPaths(await get('docs/script/main.js')));
await writeFile(path.join(OUT, 'main.js'), CREDIT + main);

const worker = patchPalette(await get('docs/script/worker.js'));
await writeFile(path.join(OUT, 'worker.js'), CREDIT + worker);

for (const shader of [
	'shaderLines.frag',
	'shaderLines.vert',
	'shaderPolygons.frag',
	'shaderPolygons.vert',
]) {
	await writeFile(path.join(OUT, 'shaders', shader), await get(`docs/shaders/${shader}`));
}

// MIT requires the notice travels with the code.
await writeFile(path.join(OUT, 'LICENSE'), await get('LICENSE'));

console.log('vendored to public/tess/ — paths patched, palette anchored to green');
