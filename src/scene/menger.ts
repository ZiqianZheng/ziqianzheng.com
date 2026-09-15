/**
 * Menger sponge geometry, generated as a flat list of box transforms.
 *
 * The sponge is the site's central form because it is genuinely self-similar
 * rather than merely repetitive: the same shape exists at every scale, so
 * zooming in never bottoms out. It also has exactly six face tunnels, which
 * maps cleanly onto six destinations.
 *
 * Construction: subdivide a cube into 3×3×3 cells and discard any cell that
 * sits at a face centre or the middle. In offset coordinates (each axis −1/0/1)
 * that is simply "discard cells with two or more zero components" — face
 * centres have exactly two, the middle has three.
 */

export type Cube = {
	/** Centre, in units where the whole sponge spans 1. */
	pos: [number, number, number];
	/** Edge length, same units. */
	size: number;
	/** Recursion depth this cube was emitted at, for tonal variation. */
	level: number;
};

/**
 * @param level How many times to subdivide. 0 is a solid cube; 2 gives 400
 *   cubes and reads clearly at screen scale; 3 gives 8000 and mostly shimmers.
 */
export function mengerCubes(level: number): Cube[] {
	const out: Cube[] = [];

	const recurse = (cx: number, cy: number, cz: number, size: number, depth: number) => {
		if (depth === 0) {
			out.push({ pos: [cx, cy, cz], size, level: depth });
			return;
		}
		const third = size / 3;
		for (let i = -1; i <= 1; i++) {
			for (let j = -1; j <= 1; j++) {
				for (let k = -1; k <= 1; k++) {
					// Two or more zero components means a face centre or the
					// middle — the cells that make the sponge's tunnels.
					const zeros = (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0) + (k === 0 ? 1 : 0);
					if (zeros >= 2) continue;
					recurse(cx + i * third, cy + j * third, cz + k * third, third, depth - 1);
				}
			}
		}
	};

	recurse(0, 0, 0, 1, level);
	return out;
}

/** The six tunnel axes, in the order destinations are assigned to them. */
export const APERTURES = [
	{ id: 'about', axis: [1, 0, 0] },
	{ id: 'research', axis: [-1, 0, 0] },
	{ id: 'writing', axis: [0, 1, 0] },
	{ id: 'teaching', axis: [0, -1, 0] },
	{ id: 'index', axis: [0, 0, 1] },
	{ id: 'contact', axis: [0, 0, -1] },
] as const satisfies readonly { id: string; axis: readonly [number, number, number] }[];

export type ApertureId = (typeof APERTURES)[number]['id'];
