/**
 * Manifold Garden-inspired palette.
 *
 * Calibrated against a colour analysis of the game's press screenshots. Three
 * findings drive everything here:
 *
 *  1. The architecture is a *warm cream*, not white — hue 40–45°, saturation
 *     only 0.08–0.17, value 0.93–0.98. Rendering it `#ffffff` is the single
 *     difference between this look and a generic greybox demo.
 *  2. Accents are near-maximum chroma and cover only ~3–5% of pixels. They are
 *     not tasteful muted tints; they are pure colour sitting in a cream world.
 *  3. Shadow is a deep indigo, not a grey. Luminance is strongly bimodal —
 *     a bright mass and a dark mass with very little in between.
 *
 * The game codes each world axis with one hue so colour reads as *orientation*
 * rather than decoration. We reuse that: each site section owns one axis.
 */

export type AxisKey = 'orange' | 'red' | 'green' | 'blue' | 'yellow' | 'violet';

/**
 * The six gravity hues. Blue runs cyan-leaning and violet magenta-leaning,
 * matching the game. Tempered a little from the measured maxima (`#ff0000`,
 * `#fee200`, `#04ee31`) so long reading sessions stay comfortable, but kept
 * well above the saturation a "tasteful" palette would use — at 3–5% coverage
 * anything less reads as mud.
 */
export const AXIS: Record<AxisKey, number> = {
	red: 0xf02a22,
	orange: 0xf09020,
	yellow: 0xfad000,
	green: 0x2ecc4a,
	blue: 0x16c4e0,
	violet: 0xa832a8,
};

/**
 * Bone architecture. Deliberately a narrow, bright, warm range: the game ships
 * essentially one material and lets the six face normals, ambient occlusion and
 * edge lines do all the work of describing form.
 */
export const STRUCTURE = {
	light: 0xfaf4e5,
	mid: 0xf0e6d0,
	dark: 0xdecfb2,
} as const;

/** Deep indigo — the dark half of the bimodal histogram. */
export const SHADOW = 0x1b2140;

/**
 * Sky. The game has no skybox and no true horizon: the repetition converges
 * into a bright band that appears both above and below, with indigo beyond.
 */
export const SKY = {
	zenith: 0x243056,
	band: 0xf7edd9,
	nadir: 0x1b2140,
} as const;

/** Fog is cream, so distant geometry dissolves into the light band. */
export const FOG = 0xf4ead4;

/**
 * Destination → axis colour. Drives both the 3D scene and the CSS accent.
 * The six non-home keys match the sponge's six face tunnels one-for-one.
 */
export const SECTION_AXIS = {
	home: 'orange',
	about: 'red',
	research: 'blue',
	writing: 'green',
	teaching: 'yellow',
	index: 'violet',
	contact: 'orange',
} as const satisfies Record<string, AxisKey>;

export type SectionKey = keyof typeof SECTION_AXIS;

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
