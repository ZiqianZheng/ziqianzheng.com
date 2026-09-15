/**
 * Find one large, flat-coloured triangle in the rendered tessellation.
 *
 * The renderer keeps its geometry inside a Web Worker and exposes none of it, so
 * rather than ask the engine what it drew, we read the picture back and work out
 * where a triangle is from the pixels: flood-fill a region of near-uniform
 * colour, then fit a triangle to it.
 *
 * Fitting a triangle (rather than tracing the region exactly) matters for looks
 * as much as for speed — the mask comes from a downsampled image, so its edges
 * are stepped, while three corner points scale back up to perfectly crisp lines.
 * Since every primitive on screen genuinely *is* a triangle, three points lose
 * almost nothing.
 */

export type Point = { x: number; y: number };
export type FoundTriangle = {
	/** Corners in CSS pixels, relative to the canvas. */
	points: [Point, Point, Point];
	centroid: Point;
	/** Source colour, as `rgb(r, g, b)`. */
	color: string;
	/** Fraction of the viewport the region covered, 0–1. */
	coverage: number;
};

/** Width to sample at. Small enough that flood fill is trivial. */
const SAMPLE_W = 320;
/** Max per-channel difference still counted as "the same triangle". */
const TOLERANCE = 12;
/** Seeds to try before giving up. */
const ATTEMPTS = 64;
/** Smallest comfortable touch target, in CSS pixels. */
const TAP_TARGET = 56;
/** Never claim more than this share of the screen — that reads as a mistake. */
const MAX_AREA = 0.32;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * What counts as "large enough", for this screen.
 *
 * Judging by viewport fraction alone is not enough: 1% of a phone is a target
 * too small to tap, while 1% of a 5K display is enormous. So two constraints,
 * and a candidate has to satisfy both —
 *
 *   prominence   relative: a meaningful share of the screen, so the highlight
 *                reads as deliberate rather than incidental;
 *   reachability absolute: a real minimum in CSS pixels, because a finger is
 *                the same size whatever it is pointing at.
 *
 * On a phone the absolute floor dominates and we demand a larger *share* of the
 * screen; on a desktop the relative floor dominates and the absolute one is met
 * many times over.
 */
export function thresholds(width: number, height: number) {
	const viewport = width * height;
	const minSide = Math.min(width, height);

	const wantedSide = Math.max(TAP_TARGET, minSide * 0.15);
	// A triangle covers roughly half of its bounding box.
	const wantedArea = wantedSide * wantedSide * 0.5;

	return {
		// Cap the demand: on a small screen the absolute floor could otherwise
		// ask for a share so large that nothing ever qualifies.
		minArea: clamp(wantedArea / viewport, 0.004, 0.02),
		maxArea: MAX_AREA,
		/** Shortest bounding-box side the fitted triangle must have, in CSS px. */
		minSpan: Math.max(TAP_TARGET, minSide * 0.09),
	};
}

/** Reusable scratch canvas — allocating one per pointer move would thrash. */
let scratch: HTMLCanvasElement | null = null;

function sample(source: HTMLCanvasElement): ImageData | null {
	const w = SAMPLE_W;
	const h = Math.max(1, Math.round((source.clientHeight / source.clientWidth) * w));
	if (!scratch) scratch = document.createElement('canvas');
	scratch.width = w;
	scratch.height = h;
	const ctx = scratch.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	try {
		// Requires the WebGL context to have been created with
		// preserveDrawingBuffer, otherwise this reads back blank.
		ctx.drawImage(source, 0, 0, w, h);
		return ctx.getImageData(0, 0, w, h);
	} catch {
		return null;
	}
}

/** Breadth-first fill from `seed` across pixels within TOLERANCE of its colour. */
function fill(img: ImageData, seed: number, visited: Uint8Array): number[] {
	const { width: w, height: h, data } = img;
	const r0 = data[seed * 4];
	const g0 = data[seed * 4 + 1];
	const b0 = data[seed * 4 + 2];

	const region: number[] = [];
	const queue = [seed];
	visited[seed] = 1;

	while (queue.length) {
		const i = queue.pop() as number;
		region.push(i);
		const x = i % w;
		const y = (i / w) | 0;

		for (let k = 0; k < 4; k++) {
			const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
			const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
			if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
			const j = ny * w + nx;
			if (visited[j]) continue;
			const o = j * 4;
			if (
				Math.abs(data[o] - r0) <= TOLERANCE &&
				Math.abs(data[o + 1] - g0) <= TOLERANCE &&
				Math.abs(data[o + 2] - b0) <= TOLERANCE
			) {
				visited[j] = 1;
				queue.push(j);
			}
		}
	}
	return region;
}

/** Andrew's monotone chain. */
function hull(points: Point[]): Point[] {
	if (points.length < 4) return points;
	const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	const cross = (o: Point, a: Point, b: Point) =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

	const half = (src: Point[]) => {
		const out: Point[] = [];
		for (const p of src) {
			while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
			out.push(p);
		}
		out.pop();
		return out;
	};
	return [...half(pts), ...half(pts.reverse())];
}

/** Largest-area triangle over hull vertices. The hull is tiny, so brute force. */
function largestTriangle(h: Point[]): [Point, Point, Point] | null {
	if (h.length < 3) return null;
	let best: [Point, Point, Point] | null = null;
	let bestArea = 0;
	for (let i = 0; i < h.length - 2; i++) {
		for (let j = i + 1; j < h.length - 1; j++) {
			for (let k = j + 1; k < h.length; k++) {
				const area = Math.abs(
					(h[j].x - h[i].x) * (h[k].y - h[i].y) - (h[k].x - h[i].x) * (h[j].y - h[i].y),
				);
				if (area > bestArea) {
					bestArea = area;
					best = [h[i], h[j], h[k]];
				}
			}
		}
	}
	return best;
}

/**
 * @param canvas The live tessellation canvas.
 * @param random Injectable RNG, so tests can be deterministic.
 */
export function pickTriangle(canvas: HTMLCanvasElement, random = Math.random): FoundTriangle | null {
	const img = sample(canvas);
	if (!img) return null;

	const limits = thresholds(canvas.clientWidth, canvas.clientHeight);
	const total = img.width * img.height;
	const visited = new Uint8Array(total);

	// Collect every qualifying region rather than only the largest: the biggest
	// one can still fail the span check — a long thin sliver has plenty of area
	// but nowhere comfortable to aim at — and we want the next one down, not
	// nothing at all.
	const candidates: number[][] = [];
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const seed = (random() * total) | 0;
		if (visited[seed]) continue;
		const region = fill(img, seed, visited);
		const area = region.length / total;
		if (area < limits.minArea || area > limits.maxArea) continue;
		candidates.push(region);
	}
	if (!candidates.length) return null;

	// Largest first: bigger triangles are easier to see and easier to hit.
	candidates.sort((a, b) => b.length - a.length);

	const w = img.width;
	// The sample is a uniform scale of the canvas, so one factor covers both axes.
	const scale = canvas.clientWidth / img.width;

	for (const region of candidates) {
		const pts: Point[] = region.map((i) => ({ x: i % w, y: (i / w) | 0 }));
		const tri = largestTriangle(hull(pts));
		if (!tri) continue;

		const corners = tri.map((p) => ({ x: p.x * scale, y: p.y * scale })) as [Point, Point, Point];
		const xs = corners.map((p) => p.x);
		const ys = corners.map((p) => p.y);
		const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
		if (span < limits.minSpan) continue;

		const seedIndex = region[0] * 4;
		return {
			points: corners,
			centroid: {
				x: (corners[0].x + corners[1].x + corners[2].x) / 3,
				y: (corners[0].y + corners[1].y + corners[2].y) / 3,
			},
			color: `rgb(${img.data[seedIndex]}, ${img.data[seedIndex + 1]}, ${img.data[seedIndex + 2]})`,
			coverage: region.length / total,
		};
	}
	return null;
}
