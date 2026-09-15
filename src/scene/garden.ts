/**
 * The Garden — a procedural, infinitely-tiling architectural scene.
 *
 * Everything here is generated from boxes at runtime: no textures, no imported
 * models, nothing to download beyond the Three.js runtime itself. The sense of
 * infinity comes from one module repeated on a lattice, with fog dissolving the
 * boundary so the repetition has no visible edge.
 *
 * The lattice wraps around the camera: as the camera drifts past a cell, that
 * cell is re-placed on the far side. The world is finite but unbounded, which
 * is the cheapest honest way to render "endless".
 */

import * as THREE from 'three';
import { AXIS, FOG, SHADOW, SKY, STRUCTURE, type AxisKey } from './palette';

export type Quality = 'high' | 'low';

export type GardenOptions = {
	canvas: HTMLCanvasElement;
	/** Start with motion disabled (prefers-reduced-motion). */
	reducedMotion?: boolean;
	quality?: Quality;
	/**
	 * Keep the drawing buffer after compositing. Costs memory and bandwidth, so
	 * it is off in production — it exists so automated screenshots of a
	 * background tab capture a painted canvas instead of a cleared one.
	 */
	preserveBuffer?: boolean;
};

/** Deterministic hash → [0,1). Keeps the world stable across reloads. */
function hash3(x: number, y: number, z: number): number {
	let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695040);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Lattice spacing. Cells are far larger than the masses inside them: the air
 * between structures is what separates "vast garden" from "parking garage", and
 * it is what lets sky reach the middle of the frame.
 */
const CELL = 108;
/** Vertical spacing. Architecture above and below eye line reads as floating. */
const CELL_Y = 96;

/**
 * Lattice half-extent in cells. 3/2 → 7×5×7 = 245 cells.
 *
 * The vertical span matters more than it looks: repetition filling the *sky*
 * is the genuinely uncanny part of this world, and it doubles as the answer to
 * an otherwise empty upper frame.
 */
const SPAN_XZ = 3;
const SPAN_Y = 2;

type Tone = keyof typeof STRUCTURE | 'axis';
type Piece = {
	/** Offset within the cell. */
	pos: [number, number, number];
	size: [number, number, number];
	tone: Tone;
};

/**
 * One cell of architecture.
 *
 * Composed as a few large masses with wide gaps rather than an enclosed room:
 * a plinth, a colonnade, an elevated deck reached by stairs, and a floating
 * frame overhead. Every piece stays well inside its cell so sky survives
 * between them, and the repeated silhouette is what reads as endless.
 *
 * Optional pieces are appended last and gated on `seed`, so the maximal cell
 * defines the instance stride and lighter cells simply leave the tail unused.
 */
function buildCell(seed: number): Piece[] {
	const p: Piece[] = [];
	const push = (
		pos: [number, number, number],
		size: [number, number, number],
		tone: Tone = 'mid',
	) => p.push({ pos, size, tone });

	const PLINTH = 46;
	const PILLAR_H = 30;
	const DECK = 28;
	const deckY = 4 + PILLAR_H + 2;

	// Plinth — the ground plane of this island.
	push([0, 2, 0], [PLINTH, 4, PLINTH], 'light');
	// A recessed lower lip reads as thickness from below.
	push([0, -1.2, 0], [PLINTH - 8, 2.4, PLINTH - 8], 'dark');

	// Colonnade around the plinth edge.
	const c = PLINTH / 2 - 4;
	for (const [sx, sz] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	] as const) {
		push([sx * c, 4 + PILLAR_H / 2, sz * c], [5, PILLAR_H, 5], 'mid');
	}
	// Beams capping the colonnade on two sides.
	for (const sz of [-1, 1]) {
		push([0, 4 + PILLAR_H + 1.5, sz * c], [c * 2 + 5, 3, 5], 'light');
	}

	// Elevated deck.
	push([0, deckY, 0], [DECK, 3, DECK], 'light');

	// Stair run from plinth up to the deck.
	const steps = 10;
	const rise = (deckY - 4) / steps;
	const run = 3.4;
	for (let i = 0; i < steps; i++) {
		push([-PLINTH / 2 + 6 + i * run, 4 + rise * (i + 0.5), PLINTH / 2 - 8], [run, rise, 9], 'mid');
	}

	// A second run at 90° — the Escher move: two staircases whose "up" disagree.
	for (let i = 0; i < steps; i++) {
		push([PLINTH / 2 - 8, 4 + rise * (i + 0.5), -PLINTH / 2 + 6 + i * run], [9, rise, run], 'mid');
	}

	// Accent surface — the gravity-colour signal, one per cell.
	//
	// Horizontal, and facing up: the sun is overhead, so an upward face takes
	// the full key light and the hue reads at full saturation. A vertical panel
	// would sit in ambient half the time and mud out to brown.
	push([0, deckY + 2.2, 0], [DECK - 6, 1.4, DECK - 6], 'axis');

	// --- optional, seed-gated (must stay last) ------------------------------

	// Tower rising off the deck.
	if (seed > 0.3) {
		push([0, deckY + 11, 0], [11, 19, 11], 'mid');
		push([0, deckY + 21.5, 0], [15, 2, 15], 'light');
	}

	// Floating cube frame — MG's signature open wireframe volume.
	if (seed > 0.55) {
		const s = 7;
		const b = 0.9;
		const cy = deckY + 30;
		const ox = (seed - 0.5) * 40;
		for (const sx of [-1, 1])
			for (const sz of [-1, 1]) push([ox + sx * s, cy, sz * s], [b, s * 2, b], 'dark');
		for (const sy of [-1, 1]) {
			for (const sz of [-1, 1]) push([ox, cy + sy * s, sz * s], [s * 2, b, b], 'dark');
			for (const sx of [-1, 1]) push([ox + sx * s, cy + sy * s, 0], [b, b, s * 2], 'dark');
		}
	}

	// An inverted slab hanging below — architecture that answers to another
	// gravity, which is the whole conceit.
	if (seed > 0.78) {
		push([0, -22, 0], [DECK, 3, DECK], 'light');
		for (const [sx, sz] of [
			[-1, -1],
			[1, 1],
		] as const) {
			push([(sx * DECK) / 3, -13, (sz * DECK) / 3], [4, 15, 4], 'dark');
		}
	}

	return p;
}

export function createGarden(opts: GardenOptions) {
	const { canvas } = opts;
	const quality: Quality = opts.quality ?? 'high';
	let reduced = opts.reducedMotion ?? false;

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: quality === 'high',
		powerPreference: 'high-performance',
		preserveDrawingBuffer: opts.preserveBuffer ?? false,
	});
	renderer.setClearColor(FOG);
	/**
	 * Budget by pixel count, not device ratio. A 5K display at dpr 2 is 13
	 * megapixels, which tanks the framerate on geometry that costs nothing —
	 * the bottleneck is fill rate, so cap the area and let dpr fall out of it.
	 */
	const PIXEL_BUDGET = quality === 'high' ? 3_000_000 : 1_200_000;

	const FAR = CELL * (SPAN_XZ + 0.6);

	const scene = new THREE.Scene();
	// Fog starts a full cell out so nearby masses stay crisp, then dissolves the
	// lattice edge before the outermost ring can reveal itself as a boundary.
	scene.fog = new THREE.Fog(FOG, CELL * 1.2, FAR);

	const camera = new THREE.PerspectiveCamera(52, 1, 0.5, FAR + CELL);

	// --- Sky ----------------------------------------------------------------
	// There is no true horizon in this world. Because the lattice repeats
	// vertically as well as sideways, the repetition converges into a bright
	// band that appears *both* above and below, with deep indigo beyond it in
	// each direction. So the gradient is symmetric about eye level, not a
	// ground-to-zenith ramp — that symmetry is a large part of the disorientation.
	const skyGeo = new THREE.SphereGeometry(FAR + CELL * 0.5, 24, 16);
	const skyMat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		uniforms: {
			zenith: { value: new THREE.Color(SKY.zenith) },
			band: { value: new THREE.Color(SKY.band) },
			nadir: { value: new THREE.Color(SKY.nadir) },
		},
		vertexShader: `
			varying float vH;
			void main() {
				vH = normalize(position).y;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 zenith;
			uniform vec3 band;
			uniform vec3 nadir;
			varying float vH;
			void main() {
				vec3 far = vH > 0.0 ? zenith : nadir;
				float t = smoothstep(0.015, 0.62, abs(vH));
				gl_FragColor = vec4(mix(band, far, t), 1.0);
			}
		`,
	});
	const sky = new THREE.Mesh(skyGeo, skyMat);
	scene.add(sky);

	// --- Light --------------------------------------------------------------
	// Flat, high-key lighting: a hemisphere fill carries the ambient tone and a
	// single sun gives every box one bright face and one shaded face. That
	// two-tone read is what makes untextured geometry legible as form.
	// A cool indigo fill against a warm sun: shadowed faces drift blue, lit
	// faces stay cream. Because every face is axis-aligned, a single directional
	// light yields exactly six discrete brightness levels — that *is* the
	// lighting model, and ambient occlusion in the material does the rest.
	// Weighted toward the hemisphere fill rather than the sun: the reference is
	// high-key and fairly flat, with most visible surface sitting bright. A
	// strong key would drive half the faces into shadow and lose the cream.
	// The fill is *warm*, not sky-blue: in this world the ambient light is bounce
	// off acres of cream architecture, so a blue fill would cancel the warmth out
	// of every surface and leave grey concrete. Only the downward fill stays cool.
	const hemi = new THREE.HemisphereLight(0xfff2dd, 0x6a7290, 1.3);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(0xfffaf0, 0.45);
	sun.position.set(-0.55, 1, 0.28).multiplyScalar(200);
	scene.add(sun);

	// --- Architecture -------------------------------------------------------
	const cells: { x: number; y: number; z: number }[] = [];
	for (let x = -SPAN_XZ; x <= SPAN_XZ; x++)
		for (let y = -SPAN_Y; y <= SPAN_Y; y++)
			for (let z = -SPAN_XZ; z <= SPAN_XZ; z++) cells.push({ x, y, z });

	// The maximal cell sets the per-cell instance stride; lighter cells leave
	// their tail slots collapsed to zero scale.
	const perCell = buildCell(0.99).length;
	const total = cells.length * perCell;

	const box = new THREE.BoxGeometry(1, 1, 1);
	// No `vertexColors` here: BoxGeometry carries no colour attribute, and
	// enabling it would multiply every surface by an undefined attribute
	// (black). Per-instance colour comes from `instanceColor` on its own.
	const material = new THREE.MeshLambertMaterial();

	/**
	 * Ambient occlusion and edge lines, computed analytically.
	 *
	 * These two effects are what make untextured boxes read as architecture
	 * rather than cardboard, and both are normally post-processing passes. But
	 * every piece here is a unit box, so the distance from a fragment to its
	 * face border is just `0.5 - |localPos|` scaled by the instance's size —
	 * exact, free, and free of the noise a screen-space AO pass would add.
	 *
	 * The edge is drawn as a narrow dark core with a faint bright halo just
	 * inside it. That profile, rather than a uniform outline, is what reads as
	 * painterly instead of cartoon.
	 */
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uEdgeWidth = { value: 0.18 };
		shader.uniforms.uEdgeColor = { value: new THREE.Color(SHADOW) };
		shader.uniforms.uAoRadius = { value: 3.0 };
		shader.uniforms.uAoStrength = { value: 0.15 };

		const varyings = `
			varying vec3 vLocalPos;
			varying vec3 vLocalNrm;
			varying vec3 vBoxScale;
		`;

		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', `#include <common>\n${varyings}`)
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				vLocalPos = position;
				vLocalNrm = normal;
				#ifdef USE_INSTANCING
					vBoxScale = vec3(
						length(instanceMatrix[0].xyz),
						length(instanceMatrix[1].xyz),
						length(instanceMatrix[2].xyz)
					);
				#else
					vBoxScale = vec3(1.0);
				#endif`,
			);

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
				uniform float uEdgeWidth;
				uniform vec3 uEdgeColor;
				uniform float uAoRadius;
				uniform float uAoStrength;
				${varyings}`,
			)
			.replace(
				'#include <fog_fragment>',
				`{
					// Pick the two axes tangent to this face. Normals are
					// axis-aligned, so exactly one component is ±1.
					vec3 an = abs(vLocalNrm);
					vec2 p, s;
					if (an.x > 0.5)      { p = vLocalPos.yz; s = vBoxScale.yz; }
					else if (an.y > 0.5) { p = vLocalPos.xz; s = vBoxScale.xz; }
					else                 { p = vLocalPos.xy; s = vBoxScale.xy; }

					// World-space distance from this fragment to the nearest border.
					vec2 d = (0.5 - abs(p)) * s;
					float e = min(d.x, d.y);
					float small = min(s.x, s.y);

					// Clamp both effects relative to the face, so a slender frame
					// bar isn't swallowed whole by a line sized for a big slab.
					float w = min(uEdgeWidth, 0.16 * small);
					float r = min(uAoRadius, 0.34 * small);

					gl_FragColor.rgb *= mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, r, e));

					float halo = smoothstep(w, w * 2.4, e) * (1.0 - smoothstep(w * 2.4, w * 4.5, e));
					gl_FragColor.rgb *= mix(1.0, 1.05, halo);

					// ~15% contrast, matching the measured edge profile. Heavier
					// than this and the scene reads as cel-shaded cartoon.
					float core = 1.0 - smoothstep(w * 0.45, w, e);
					gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdgeColor, core * 0.34);
				}
				#include <fog_fragment>`,
			);
	};
	const mesh = new THREE.InstancedMesh(box, material, total);
	mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
	mesh.frustumCulled = false;
	scene.add(mesh);

	const dummy = new THREE.Object3D();
	const color = new THREE.Color();
	const axisColor = new THREE.Color(AXIS.neutral);
	/**
	 * Flags which instances carry the accent colour so navigation can retint
	 * just those. A flag array rather than a list: cells are rewritten as the
	 * lattice recycles, and a list would grow without bound.
	 */
	const isAccent = new Uint8Array(total);

	function writeCell(cellIndex: number, cx: number, cy: number, cz: number) {
		const seed = hash3(cx, cy, cz);
		const pieces = buildCell(seed);
		const base = cellIndex * perCell;
		// Rotate cells by a quarter turn so the repetition reads as architecture
		// rather than wallpaper.
		const spin = (Math.floor(seed * 4093) % 4) * (Math.PI / 2);
		const cosS = Math.round(Math.cos(spin));
		const sinS = Math.round(Math.sin(spin));

		for (let i = 0; i < perCell; i++) {
			const idx = base + i;
			const piece = pieces[i];
			if (!piece) {
				dummy.position.set(0, 0, 0);
				dummy.rotation.set(0, 0, 0);
				dummy.scale.set(0, 0, 0);
				dummy.updateMatrix();
				mesh.setMatrixAt(idx, dummy.matrix);
				isAccent[idx] = 0;
				continue;
			}
			const [px, py, pz] = piece.pos;
			const [sx, sy, sz] = piece.size;
			dummy.position.set(
				cx * CELL + (px * cosS - pz * sinS),
				cy * CELL_Y + py,
				cz * CELL + (px * sinS + pz * cosS),
			);
			dummy.rotation.set(0, spin, 0);
			dummy.scale.set(sx, sy, sz);
			dummy.updateMatrix();
			mesh.setMatrixAt(idx, dummy.matrix);

			if (piece.tone === 'axis') {
				isAccent[idx] = 1;
				color.copy(axisColor);
			} else {
				isAccent[idx] = 0;
				color.setHex(STRUCTURE[piece.tone]);
				// Break tone up very slightly so long runs of slab don't band.
				color.multiplyScalar(0.96 + hash3(cx * 7 + i, cy, cz * 13 - i) * 0.08);
			}
			mesh.setColorAt(idx, color);
		}
	}

	cells.forEach((c, i) => writeCell(i, c.x, c.y, c.z));
	mesh.instanceMatrix.needsUpdate = true;
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

	function setAxis(key: AxisKey) {
		axisColor.setHex(AXIS[key]);
		for (let i = 0; i < total; i++) if (isAccent[i]) mesh.setColorAt(i, axisColor);
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	// --- Camera rig ---------------------------------------------------------
	// The camera flies forward forever; the lattice wraps around it, so we never
	// run out of world and the coordinates never grow large enough to lose
	// float precision.
	const rig = { t: 0 };
	const SPAN_CELLS = SPAN_XZ * 2 + 1;

	function wrap() {
		// Re-place any cell that has fallen behind the camera by more than half
		// the lattice. The half-open comparison (>= on one side, > on the other)
		// keeps a cell sitting exactly on the boundary from flipping every frame.
		const half = (SPAN_CELLS / 2) * CELL;
		let dirty = false;
		for (let i = 0; i < cells.length; i++) {
			const c = cells[i];
			let moved = false;
			const dx = camera.position.x - c.x * CELL;
			const dz = camera.position.z - c.z * CELL;
			if (dx > half) (c.x += SPAN_CELLS), (moved = true);
			else if (dx < -half) (c.x -= SPAN_CELLS), (moved = true);
			if (dz > half) (c.z += SPAN_CELLS), (moved = true);
			else if (dz < -half) (c.z -= SPAN_CELLS), (moved = true);
			if (moved) {
				writeCell(i, c.x, c.y, c.z);
				dirty = true;
			}
		}
		if (dirty) {
			mesh.instanceMatrix.needsUpdate = true;
			if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
		}
	}

	let raf = 0;
	let last = performance.now();
	let running = false;

	function resize() {
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		const native = window.devicePixelRatio || 1;
		const dpr = Math.max(1, Math.min(native, Math.sqrt(PIXEL_BUDGET / (w * h))));
		renderer.setPixelRatio(dpr);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	function step(dt: number) {
		if (!reduced) rig.t += dt;
		const t = rig.t;

		// Eye height sits between the plinths and the decks, so architecture
		// passes both above and below — that vertical sandwich is what makes the
		// space feel inhabited rather than surveyed from a helicopter.
		// Fly down the corridor between cells rather than through their centres.
		// Every mass sits within ±23 of its cell centre, so holding the path near
		// the half-cell line keeps a clear lane and puts architecture on both
		// sides — which is the view worth having anyway.
		const lane = CELL / 2;
		const speed = 5.0;
		camera.position.set(
			lane + Math.sin(t * 0.06) * 14,
			46 + Math.sin(t * 0.045) * 6,
			-t * speed,
		);
		camera.rotation.set(
			-0.02 + Math.sin(t * 0.041) * 0.04,
			0.42 + Math.sin(t * 0.029) * 0.2,
			Math.sin(t * 0.017) * 0.01,
			'YXZ',
		);
		sky.position.copy(camera.position);
		wrap();

		renderer.render(scene, camera);
	}

	function frame(now: number) {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		step(dt);
		raf = requestAnimationFrame(frame);
	}

	function start() {
		if (running) return;
		running = true;
		last = performance.now();
		raf = requestAnimationFrame(frame);
	}
	function stop() {
		running = false;
		cancelAnimationFrame(raf);
	}

	resize();
	// Paint one frame synchronously so the canvas is never shown empty. This
	// also covers tabs that open in the background, where requestAnimationFrame
	// is suspended and a rAF-gated reveal would leave the canvas blank.
	step(0);

	const ro = new ResizeObserver(resize);
	ro.observe(canvas);

	// Don't burn battery on a tab nobody is looking at.
	const onVis = () => (document.hidden ? stop() : start());
	document.addEventListener('visibilitychange', onVis);

	start();

	return {
		setAxis,
		setReducedMotion(v: boolean) {
			reduced = v;
		},
		start,
		stop,
		/** Advance and render exactly one frame. Used by screenshot tooling. */
		step,
		/** Live handles, for dev inspection only. */
		internals: { renderer, scene, camera, mesh, total, cells },
		dispose() {
			stop();
			ro.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			box.dispose();
			material.dispose();
			skyGeo.dispose();
			skyMat.dispose();
			renderer.dispose();
		},
	};
}
