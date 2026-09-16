/**
 * Choose a region of the rendered tessellation to offer as a way in.
 *
 * The renderer keeps its geometry inside a Web Worker and exposes none of it, so
 * rather than ask the engine what it drew, we read the picture back and work out
 * the shape from pixels.
 *
 * The region is *not* forced to be a single triangle. One primitive is rarely
 * the right size — at any given moment the scene is mostly either enormous
 * triangles or a fine dust of tiny ones — so instead we seed on one primitive
 * and absorb its neighbours until the area is right, then trace the outline of
 * whatever that union turned out to be. The result is a polygon whose edges are
 * real edges of real triangles on screen, at a size we choose rather than one
 * the scene happened to offer.
 */

export type Point = { x: number; y: number };

/** One flying piece of a shattered region. */
export type Shard = {
	points: [Point, Point, Point];
	centroid: Point;
	/** Colour sampled from the canvas under this piece, as `rgb(r, g, b)`. */
	color: string;
};

export type FoundRegion = {
	/** Outline in CSS pixels, relative to the canvas. */
	polygon: Point[];
	centroid: Point;
	/** Colour of the seed primitive, as `rgb(r, g, b)`. */
	color: string;
	/** Fraction of the viewport covered, 0–1. */
	coverage: number;
	/** How many primitives were merged. */
	parts: number;
	/** The region broken into triangular pieces, each carrying its own colour. */
	shards: Shard[];
};

/**
 * How many pieces a region breaks into.
 *
 * Scaled to the number of primitives actually merged, rather than fixed: a
 * constant count made a region built from fifty triangles fly apart as a dozen
 * large slabs, and the mismatch against what is plainly on screen is obvious.
 * The floor keeps a coarse region from breaking into two or three pieces; the
 * ceiling is about animation cost, since every piece is an element with its own
 * transform running for the whole flight.
 */
const MIN_SHARDS = 12;
const MAX_SHARDS = 96;

/**
 * Width to sample at. Larger than strictly needed for the flood fill, because
 * the outline is traced from this mask and its resolution sets how closely the
 * polygon follows the real triangle edges.
 */
const SAMPLE_W = 820;
/** Max per-channel difference still counted as the same primitive. */
const TOLERANCE = 10;
/** Seeds to try before giving up. */
const ATTEMPTS = 26;
/**
 * Most primitives to fuse into one region.
 *
 * Deliberately high. The scene swings between phases of a few enormous
 * triangles and phases of fine dust, and in the latter a usable shape genuinely
 * needs hundreds of primitives — a low cap does not produce a smaller offer, it
 * produces no offer at all. Each part is one tiny flood fill and the frontier is
 * maintained incrementally, so the cost stays flat. Raising the sampling
 * resolution raises this requirement too, since a primitive of a given size on
 * screen then covers proportionally more sampled pixels.
 */
const MAX_PARTS = 900;
/** Smallest comfortable touch target, in CSS pixels. */
const TAP_TARGET = 56;
/** Never claim more than this share of the screen — that reads as a mistake. */
const MAX_AREA = 0.34;
/**
 * Channel sum below which a region is the cleared background rather than a
 * primitive. The renderer clears to black and the scene rarely fills the frame,
 * so the void around it is a large, perfectly uniform area — exactly what a
 * flood fill likes most. Left unguarded it wins almost every time.
 */
const BACKGROUND_SUM = 40;
/**
 * A region touching this many canvas edges is surrounding the artwork, not part
 * of it. Backs up the brightness test for any background that is not pure black.
 */
const MAX_EDGES = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * What counts as "large enough", for this screen.
 *
 * Judging by viewport fraction alone is not enough: 1% of a phone is a target
 * too small to tap, while 1% of a 5K display is enormous. So two constraints —
 * prominence is relative, reachability is absolute, because a finger is the same
 * size whatever it is pointing at.
 */
export function thresholds(width: number, height: number) {
	const viewport = width * height;
	const minSide = Math.min(width, height);
	const wantedSide = Math.max(TAP_TARGET, minSide * 0.18);
	// A merged region covers roughly two thirds of its bounding box.
	const wantedArea = wantedSide * wantedSide * 0.66;
	return {
		minArea: clamp(wantedArea / viewport, 0.007, 0.035),
		maxArea: MAX_AREA,
		/** Shortest bounding-box side the shape must have, in CSS px. */
		minSpan: Math.max(TAP_TARGET, minSide * 0.13),
		/**
		 * Area as a fraction of its bounding box. A shape can clear both the
		 * area and span tests and still be a thin wedge with the label spilling
		 * out of both sides; requiring it to actually fill its box keeps the
		 * offer chunky enough to read as a target.
		 */
		minFill: 0.42,
	};
}

let scratch: HTMLCanvasElement | null = null;

/** Cap on sampled pixels, so a tall portrait viewport is not far costlier. */
const MAX_SAMPLE_PIXELS = 420_000;

function sample(source: HTMLCanvasElement): ImageData | null {
	// Never sample above the source's own size: on a narrow phone `SAMPLE_W`
	// would upscale, which costs more and resolves nothing extra. And cap the
	// total, because scaling by width alone makes a tall portrait canvas several
	// times the area of a landscape one.
	let w = Math.max(1, Math.min(SAMPLE_W, Math.round(source.clientWidth)));
	let h = Math.max(1, Math.round((source.clientHeight / source.clientWidth) * w));
	if (w * h > MAX_SAMPLE_PIXELS) {
		const k = Math.sqrt(MAX_SAMPLE_PIXELS / (w * h));
		w = Math.max(1, Math.round(w * k));
		h = Math.max(1, Math.round(h * k));
	}
	if (!scratch) scratch = document.createElement('canvas');
	scratch.width = w;
	scratch.height = h;
	const ctx = scratch.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	try {
		// Requires the WebGL context to have preserveDrawingBuffer, otherwise
		// this reads back blank.
		ctx.drawImage(source, 0, 0, w, h);
		return ctx.getImageData(0, 0, w, h);
	} catch {
		return null;
	}
}

const isBackground = (d: Uint8ClampedArray, i: number) =>
	d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] < BACKGROUND_SUM;

/** Flood one primitive into `mask`, returning the pixels it added. */
function floodPrimitive(img: ImageData, seed: number, mask: Uint8Array): number[] {
	const { width: w, height: h, data } = img;
	const r0 = data[seed * 4];
	const g0 = data[seed * 4 + 1];
	const b0 = data[seed * 4 + 2];

	const added: number[] = [];
	const stack = [seed];
	mask[seed] = 1;

	while (stack.length) {
		const i = stack.pop() as number;
		added.push(i);
		const x = i % w;
		const y = (i / w) | 0;
		for (let k = 0; k < 4; k++) {
			const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
			const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const j = ny * w + nx;
			if (mask[j]) continue;
			const o = j * 4;
			if (
				Math.abs(data[o] - r0) <= TOLERANCE &&
				Math.abs(data[o + 1] - g0) <= TOLERANCE &&
				Math.abs(data[o + 2] - b0) <= TOLERANCE
			) {
				mask[j] = 1;
				stack.push(j);
			}
		}
	}
	return added;
}

/**
 * Add any neighbours of `pixels` that sit outside the region onto the frontier.
 *
 * Only ever called with newly-added pixels. Rescanning the whole region each
 * time it grows would make the merge quadratic, which matters because a
 * fine-grained scene needs hundreds of merges.
 */
function extendFrontier(
	pixels: number[],
	mask: Uint8Array,
	img: ImageData,
	frontier: number[],
	queued: Uint8Array,
): void {
	const { width: w, height: h } = img;
	for (const i of pixels) {
		const x = i % w;
		const y = (i / w) | 0;
		for (let k = 0; k < 4; k++) {
			const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
			const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const j = ny * w + nx;
			if (mask[j] || queued[j] || isBackground(img.data, j)) continue;
			queued[j] = 1;
			frontier.push(j);
		}
	}
}

function edgesTouched(pixels: number[], w: number, h: number): number {
	let left = false;
	let right = false;
	let top = false;
	let bottom = false;
	for (const i of pixels) {
		const x = i % w;
		const y = (i / w) | 0;
		if (x === 0) left = true;
		else if (x === w - 1) right = true;
		if (y === 0) top = true;
		else if (y === h - 1) bottom = true;
	}
	return Number(left) + Number(right) + Number(top) + Number(bottom);
}

/**
 * Moore-neighbour boundary trace. Walks the outside of the mask one pixel at a
 * time and returns the loop in order.
 */
function traceOutline(mask: Uint8Array, w: number, h: number): Point[] {
	let start = -1;
	for (let i = 0; i < mask.length; i++) {
		if (mask[i]) {
			start = i;
			break;
		}
	}
	if (start < 0) return [];

	// Clockwise from west.
	const dirs = [
		[-1, 0],
		[-1, -1],
		[0, -1],
		[1, -1],
		[1, 0],
		[1, 1],
		[0, 1],
		[-1, 1],
	];

	const loop: Point[] = [];
	let cur = start;
	let dir = 0;
	// A ragged region can walk its own boundary for a very long time. Cap it:
	// beyond a few thousand steps the extra detail is all discarded by
	// simplification anyway, and the unbounded version can produce a
	// six-figure point list that makes everything downstream crawl.
	const MAX_STEPS = 6000;
	for (let guard = 0; guard < MAX_STEPS; guard++) {
		loop.push({ x: cur % w, y: (cur / w) | 0 });
		const cx = cur % w;
		const cy = (cur / w) | 0;
		let moved = false;
		// Resume the search just after the direction we arrived from.
		for (let k = 0; k < 8; k++) {
			const d = (dir + 6 + k) % 8;
			const nx = cx + dirs[d][0];
			const ny = cy + dirs[d][1];
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const j = ny * w + nx;
			if (!mask[j]) continue;
			dir = d;
			cur = j;
			moved = true;
			break;
		}
		if (!moved) break;
		if (cur === start && loop.length > 2) break;
	}
	return loop;
}

/**
 * Most corners the offered shape may have.
 *
 * The union of a few hundred primitives has a ragged outline, and tracing it
 * faithfully gives a shape that reads as a stain rather than a thing you can
 * click. Simplifying down to a handful of corners keeps it recognisably carved
 * out of the mosaic while still looking deliberate.
 */
const MAX_VERTICES = 16;

/** Ramer–Douglas–Peucker. Straightens the stepped mask edges into real lines. */
function simplify(points: Point[], epsilon: number): Point[] {
	if (points.length < 3) return points;

	const perp = (p: Point, a: Point, b: Point) => {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
		return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
	};

	const run = (pts: Point[]): Point[] => {
		if (pts.length < 3) return pts;
		let worst = 0;
		let idx = 0;
		for (let i = 1; i < pts.length - 1; i++) {
			const d = perp(pts[i], pts[0], pts[pts.length - 1]);
			if (d > worst) {
				worst = d;
				idx = i;
			}
		}
		if (worst <= epsilon) return [pts[0], pts[pts.length - 1]];
		return [...run(pts.slice(0, idx + 1)).slice(0, -1), ...run(pts.slice(idx))];
	};

	/*
	 * Douglas–Peucker works on an open line, so a closed loop has to be cut
	 * somewhere first — and both endpoints of each half are kept no matter what.
	 * Cutting at an arbitrary index therefore nails two vertices to two
	 * meaningless points partway along an edge, and spends the budget correcting
	 * for them. Cutting at the two points furthest apart puts them on genuine
	 * extremes of the shape, which are corners far more often than not.
	 */
	let far = 0;
	let best = -1;
	for (let i = 1; i < points.length; i++) {
		const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
		if (d > best) {
			best = d;
			far = i;
		}
	}
	if (far < 2 || far > points.length - 2) {
		far = Math.floor(points.length / 2);
	}
	return [...run(points.slice(0, far + 1)).slice(0, -1), ...run(points.slice(far))];
}

/**
 * Simplify until the outline is down to at most `limit` corners.
 *
 * A fixed tolerance cannot do this: how ragged the traced boundary is depends on
 * how many primitives were merged and how large they were, so the tolerance that
 * yields a clean hexagon in one frame yields a forty-sided blob in the next.
 * Raising it until the count comes down adapts to whatever the scene gave us.
 */
function simplifyTo(points: Point[], limit: number): Point[] {
	// Each pass simplifies the *previous* result rather than the original
	// outline. Re-running over the full boundary every time is quadratic in the
	// number of passes and, on a large ragged region, slow enough to freeze the
	// page. Raising the tolerance on an already-reduced line is equivalent here
	// and costs almost nothing.
	// Douglas–Peucker recurses, and its worst case is linear in the input, so a
	// several-thousand-point boundary risks blowing the stack. Thin it first —
	// at this scale the dropped points sit well inside the tolerance anyway.
	const MAX_INPUT = 1500;
	if (points.length > MAX_INPUT) {
		const step = Math.ceil(points.length / MAX_INPUT);
		points = points.filter((_, i) => i % step === 0);
	}

	let result = simplify(points, 1.0);
	let epsilon = 1.0;
	while (result.length > limit && epsilon < 400) {
		epsilon *= 1.7;
		result = simplify(result, epsilon);
	}
	return result;
}

/**
 * Break a region into triangular pieces, each carrying the colour of the canvas
 * beneath it.
 *
 * Fans from the centroid first, which gives one triangle per edge of the
 * outline, then repeatedly splits whichever piece is largest across its longest
 * edge until there are enough. Splitting the largest keeps the pieces roughly
 * even in size — fanning alone leaves one huge shard wherever the outline has a
 * long edge, and that one piece dominates the whole effect.
 */
function makeShards(
	polygon: Point[],
	centroid: Point,
	img: ImageData,
	scale: number,
	count: number,
): Shard[] {
	const tris: [Point, Point, Point][] = polygon.map((p, i) => [
		centroid,
		p,
		polygon[(i + 1) % polygon.length],
	]);

	const area = (t: [Point, Point, Point]) =>
		Math.abs((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[2].x - t[0].x) * (t[1].y - t[0].y)) / 2;

	// Bounded: a degenerate triangle can never be split into anything larger, so
	// without a ceiling this could spin.
	for (let guard = 0; tris.length < count && guard < count * 3; guard++) {
		let biggest = 0;
		for (let i = 1; i < tris.length; i++) if (area(tris[i]) > area(tris[biggest])) biggest = i;
		const t = tris[biggest];
		if (area(t) < 1) break;

		let edge: [number, number, number] = [0, 1, 2];
		let longest = -1;
		for (const e of [
			[0, 1, 2],
			[1, 2, 0],
			[2, 0, 1],
		] as [number, number, number][]) {
			const len = Math.hypot(t[e[0]].x - t[e[1]].x, t[e[0]].y - t[e[1]].y);
			if (len > longest) {
				longest = len;
				edge = e;
			}
		}
		const [a, b, c] = edge;
		const mid = { x: (t[a].x + t[b].x) / 2, y: (t[a].y + t[b].y) / 2 };
		tris.splice(biggest, 1, [t[a], mid, t[c]], [mid, t[b], t[c]]);
	}

	return tris.map((points) => {
		const c = {
			x: (points[0].x + points[1].x + points[2].x) / 3,
			y: (points[0].y + points[1].y + points[2].y) / 3,
		};
		const sx = Math.min(img.width - 1, Math.max(0, Math.round(c.x / scale)));
		const sy = Math.min(img.height - 1, Math.max(0, Math.round(c.y / scale)));
		const o = (sy * img.width + sx) * 4;
		return {
			points,
			centroid: c,
			color: `rgb(${img.data[o]}, ${img.data[o + 1]}, ${img.data[o + 2]})`,
		};
	});
}

export type PickOptions = {
	random?: () => number;
	/**
	 * Centroid of the previous choice, in CSS pixels. The next pick is kept away
	 * from it, so moving the pointer again offers a different way in rather than
	 * landing on the same shape twice.
	 */
	avoid?: Point | null;
};

export function pickRegion(canvas: HTMLCanvasElement, options: PickOptions = {}): FoundRegion | null {
	const random = options.random ?? Math.random;
	const img = sample(canvas);
	if (!img) return null;

	const { width: w, height: h, data } = img;
	const total = w * h;
	const limits = thresholds(canvas.clientWidth, canvas.clientHeight);
	const targetPixels = limits.minArea * total;
	const maxPixels = limits.maxArea * total;
	const scale = canvas.clientWidth / w;
	const apart = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.28;

	const seeded = new Uint8Array(total);
	const results: FoundRegion[] = [];

	for (let attempt = 0; attempt < ATTEMPTS && results.length < 6; attempt++) {
		const seed = (random() * total) | 0;
		if (seeded[seed] || isBackground(data, seed)) continue;
		seeded[seed] = 1;

		const mask = new Uint8Array(total);
		let pixels = floodPrimitive(img, seed, mask);
		if (!pixels.length) continue;
		let parts = 1;

		/**
		 * Absorb neighbours until the region is big enough to be worth offering.
		 *
		 * Breadth-first, one primitive at a time. Expanding evenly in every
		 * direction keeps the shape compact for free — picking neighbours at
		 * random lets it wander into a long snake, which has plenty of area but
		 * nowhere comfortable to aim at. An earlier version chose the neighbour
		 * nearest the centre of mass, which does the same job but rescans the
		 * whole frontier every merge; at a few hundred merges that is quadratic
		 * and locks the page up.
		 */
		const frontier: number[] = [];
		const queued = new Uint8Array(total);
		extendFrontier(pixels, mask, img, frontier, queued);

		let head = 0;
		while (pixels.length < targetPixels && parts < MAX_PARTS && head < frontier.length) {
			const next = frontier[head++];
			if (mask[next]) continue;

			const added = floodPrimitive(img, next, mask);
			if (!added.length) continue;
			// One runaway neighbour would swamp the shape; undo it and stop
			// rather than accept a blob covering half the screen.
			if (pixels.length + added.length > maxPixels) {
				for (const i of added) mask[i] = 0;
				break;
			}
			extendFrontier(added, mask, img, frontier, queued);
			pixels = pixels.concat(added);
			parts++;
		}

		// Slightly short of the target is still worth offering — far better than
		// showing nothing when the visitor moves the pointer — but not so short
		// that the shape stops reading as something you could click.
		if (pixels.length < targetPixels * 0.75 || pixels.length > maxPixels) continue;
		if (edgesTouched(pixels, w, h) > MAX_EDGES) continue;

		// Reject thin wedges: plenty of area, no room to aim.
		let minX = w;
		let maxX = 0;
		let minY = h;
		let maxY = 0;
		for (const i of pixels) {
			const px = i % w;
			const py = (i / w) | 0;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;
		}
		const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
		if (pixels.length / boxArea < limits.minFill) continue;

		const outline = traceOutline(mask, w, h);
		if (outline.length < 3) continue;

		const polygon = simplifyTo(outline, MAX_VERTICES).map((p) => ({
			x: p.x * scale,
			y: p.y * scale,
		}));
		if (polygon.length < 3) continue;

		const xs = polygon.map((p) => p.x);
		const ys = polygon.map((p) => p.y);
		const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		if (span < limits.minSpan) continue;

		// Area-weighted centroid, so the label sits inside concave shapes rather
		// than in a notch outside them.
		let cx = 0;
		let cy = 0;
		for (const i of pixels) {
			cx += i % w;
			cy += (i / w) | 0;
		}
		const centroid = { x: (cx / pixels.length) * scale, y: (cy / pixels.length) * scale };

		const o = seed * 4;
		results.push({
			polygon,
			centroid,
			color: `rgb(${data[o]}, ${data[o + 1]}, ${data[o + 2]})`,
			coverage: pixels.length / total,
			parts,
			shards: makeShards(polygon, centroid, img, scale, clamp(parts, MIN_SHARDS, MAX_SHARDS)),
		});
	}

	if (!results.length) return null;

	// Prefer one away from last time; fall back if the scene offers nothing else.
	if (options.avoid) {
		const far = results.filter(
			(r) => Math.hypot(r.centroid.x - options.avoid!.x, r.centroid.y - options.avoid!.y) > apart,
		);
		if (far.length) return far[(random() * far.length) | 0];
	}
	return results[(random() * results.length) | 0];
}
