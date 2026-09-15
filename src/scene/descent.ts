/**
 * The Descent — the site's navigation surface.
 *
 * A Menger sponge floats in a void. Each of its six face tunnels is a
 * destination. Clicking one flies the camera into it; the ⅓-scale copy nested
 * at the centre grows to fill the frame, and you arrive one level deeper.
 *
 * The trick that makes the descent seamless is that the form is self-similar.
 * We render three nested copies at scales 1, ⅓ and ⅑. Flying the camera from
 * radius D to D/3 leaves the ⅓ copy framed *exactly* as the full-size copy was
 * at the start — so "going down a level" needs no rebuild at all. We simply put
 * the camera back at D. The state is numerically identical and visually
 * continuous, which is also why the zoom can never run out of precision.
 */

import * as THREE from 'three';
import { AXIS, FOG, SECTION_AXIS, SKY, STRUCTURE, type AxisKey } from './palette';
import { APERTURES, mengerCubes, type ApertureId } from './menger';
import { createArchMaterial } from './material';

/** Camera radius that frames the sponge with margin. */
const D = 2.4;
/** Nested copies rendered. Three is enough: the fourth is sub-pixel. */
const LEVELS = 3;
const SPONGE_LEVEL = 2;
const DESCENT_MS = 1700;

export type DescentEvents = {
	/** Aperture under the pointer changed (null when none). */
	onHover?: (id: ApertureId | null) => void;
	/** A descent began. Fires immediately on click. */
	onEnter?: (id: ApertureId) => void;
	/** A descent completed and the next level is framed. */
	onArrive?: (id: ApertureId) => void;
};

export type DescentOptions = DescentEvents & {
	canvas: HTMLCanvasElement;
	reducedMotion?: boolean;
	preserveBuffer?: boolean;
};

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createDescent(opts: DescentOptions) {
	const { canvas } = opts;
	let reduced = opts.reducedMotion ?? false;

	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		powerPreference: 'high-performance',
		preserveDrawingBuffer: opts.preserveBuffer ?? false,
	});
	renderer.setClearColor(SKY.zenith);
	const PIXEL_BUDGET = 3_000_000;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 60);

	// --- void ---------------------------------------------------------------
	// A dark, softly graded field rather than the flat clear colour, so the
	// sponge reads as floating in depth rather than pasted on a backdrop.
	const voidGeo = new THREE.SphereGeometry(30, 24, 16);
	const voidMat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		uniforms: {
			inner: { value: new THREE.Color(SKY.band) },
			outer: { value: new THREE.Color(SKY.zenith) },
		},
		vertexShader: `
			varying vec3 vDir;
			void main() {
				vDir = normalize(position);
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: `
			uniform vec3 inner;
			uniform vec3 outer;
			varying vec3 vDir;
			void main() {
				// Warm glow behind the form, falling off to indigo at the edges.
				float t = smoothstep(0.0, 0.85, length(vDir.xy));
				gl_FragColor = vec4(mix(inner, outer, t), 1.0);
			}
		`,
	});
	// Parented to the camera so the warm core stays centred on screen rather
	// than pinned to a world axis.
	const voidMesh = new THREE.Mesh(voidGeo, voidMat);
	camera.add(voidMesh);
	scene.add(camera);

	// --- light --------------------------------------------------------------
	const hemi = new THREE.HemisphereLight(0xfff2dd, 0x6a7290, 1.25);
	scene.add(hemi);
	const sun = new THREE.DirectionalLight(0xfffaf0, 0.55);
	sun.position.set(-0.55, 1, 0.4).multiplyScalar(10);
	scene.add(sun);

	// --- the sponge ---------------------------------------------------------
	// One group holds every nested copy, so pointer rotation moves the whole
	// stack together and the tunnels stay aligned through scale.
	const form = new THREE.Group();
	scene.add(form);

	const cubes = mengerCubes(SPONGE_LEVEL);
	const total = cubes.length * LEVELS;
	const box = new THREE.BoxGeometry(1, 1, 1);
	const material = createArchMaterial({ edgeWidth: 0.004, aoRadius: 0.05, aoStrength: 0.18 });
	const mesh = new THREE.InstancedMesh(box, material, total);
	mesh.frustumCulled = false;
	form.add(mesh);

	const dummy = new THREE.Object3D();
	const color = new THREE.Color();
	let i = 0;
	for (let lvl = 0; lvl < LEVELS; lvl++) {
		const s = Math.pow(1 / 3, lvl);
		for (const c of cubes) {
			dummy.position.set(c.pos[0] * s, c.pos[1] * s, c.pos[2] * s);
			dummy.rotation.set(0, 0, 0);
			dummy.scale.setScalar(c.size * s);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
			// Deeper copies sit slightly darker, which reads as depth even
			// before perspective does.
			const tone = lvl === 0 ? STRUCTURE.light : lvl === 1 ? STRUCTURE.mid : STRUCTURE.dark;
			color.setHex(tone);
			mesh.setColorAt(i, color);
			i++;
		}
	}
	mesh.instanceMatrix.needsUpdate = true;
	if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

	// --- apertures ----------------------------------------------------------
	// A luminous patch set just inside each tunnel mouth. It is both the hover
	// affordance and the click target: with no instructions on screen, the
	// glow has to carry the whole invitation.
	type Gate = {
		id: ApertureId;
		axis: THREE.Vector3;
		mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
		base: number;
		glow: number;
	};
	const gates: Gate[] = [];
	for (const a of APERTURES) {
		const axis = new THREE.Vector3(...a.axis);
		/**
		 * A glowing frame, not a filled patch. The tunnel must stay clear —
		 * looking down it you see the nested copy, and through *its* tunnel the
		 * one after that, which is where the sense of depth comes from. So the
		 * quad draws only a ring at its border plus a faint inner wash, and
		 * blends additively so it reads as light rather than paint.
		 */
		const mat = new THREE.ShaderMaterial({
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			side: THREE.FrontSide,
			uniforms: {
				uColor: {
					value: new THREE.Color(
						AXIS[SECTION_AXIS[a.id as keyof typeof SECTION_AXIS] as AxisKey],
					),
				},
				uOpacity: { value: 0 },
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
			fragmentShader: `
				uniform vec3 uColor;
				uniform float uOpacity;
				varying vec2 vUv;
				void main() {
					float d = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5));
					float ring = smoothstep(0.33, 0.43, d) * (1.0 - smoothstep(0.47, 0.5, d));
					float wash = (1.0 - smoothstep(0.0, 0.5, d)) * 0.22;
					gl_FragColor = vec4(uColor, (ring + wash) * uOpacity);
				}
			`,
		});
		// Just outside the mouth, front-facing, so it disappears as the face
		// turns away instead of glowing through the solid form.
		const m = new THREE.Mesh(new THREE.PlaneGeometry(1 / 3, 1 / 3), mat);
		m.position.copy(axis).multiplyScalar(0.502);
		m.lookAt(m.position.clone().add(axis));
		m.userData.gate = a.id;
		m.renderOrder = 2;
		form.add(m);
		gates.push({ id: a.id as ApertureId, axis, mesh: m, base: 0.5, glow: 0 });
	}

	// --- pointer & camera state --------------------------------------------
	const pointer = new THREE.Vector2(0, 0);
	const raycaster = new THREE.Raycaster();
	/** Where the form is drifting toward, nudged by the pointer. */
	const spin = { x: 0.35, y: 0.6, tx: 0.35, ty: 0.6 };
	let hovered: ApertureId | null = null;
	let idleSince = performance.now();
	let hasPointer = false;

	/** Camera orientation as a direction on the unit sphere, times radius. */
	const viewDir = new THREE.Vector3(0.45, 0.35, 1).normalize();
	let radius = D;

	type Flight = {
		id: ApertureId;
		/** Seconds accumulated from the frame delta, not the wall clock, so the
		 *  descent is deterministic and can be stepped frame-by-frame. */
		elapsed: number;
		fromDir: THREE.Vector3;
		toDir: THREE.Vector3;
	};
	let flight: Flight | null = null;

	function setHover(id: ApertureId | null) {
		if (id === hovered) return;
		hovered = id;
		canvas.style.cursor = id ? 'pointer' : 'default';
		opts.onHover?.(id);
	}

	function begin(id: ApertureId) {
		if (flight) return;
		const gate = gates.find((g) => g.id === id);
		if (!gate) return;
		opts.onEnter?.(id);

		if (reduced) {
			// No dive: arrive immediately. The level is self-similar, so there
			// is nothing to interpolate toward anyway.
			opts.onArrive?.(id);
			return;
		}
		// Fly along the tunnel's *current world* direction, and freeze the
		// drift, so the mouth stays put while we aim at it.
		const worldAxis = gate.axis.clone().applyQuaternion(form.quaternion).normalize();
		flight = { id, elapsed: 0, fromDir: viewDir.clone(), toDir: worldAxis };
	}

	// --- events -------------------------------------------------------------
	function onPointerMove(e: PointerEvent) {
		const r = canvas.getBoundingClientRect();
		pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
		pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
		hasPointer = true;
		idleSince = performance.now();
		// The form leans toward the cursor. This is the main signal that the
		// page is interactive at all, so it must respond instantly.
		spin.tx = 0.35 + pointer.y * 0.45;
		spin.ty = 0.6 + pointer.x * 0.8;
	}

	function onClick() {
		if (hovered) begin(hovered);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') opts.onHover?.(null);
	}

	canvas.addEventListener('pointermove', onPointerMove);
	canvas.addEventListener('click', onClick);
	window.addEventListener('keydown', onKey);

	// --- loop ---------------------------------------------------------------
	let raf = 0;
	let running = false;
	let last = performance.now();

	function resize() {
		const w = canvas.clientWidth || 1;
		const h = canvas.clientHeight || 1;
		const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, Math.sqrt(PIXEL_BUDGET / (w * h))));
		renderer.setPixelRatio(dpr);
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	}

	function step(dt: number) {
		const now = performance.now();

		if (flight) {
			flight.elapsed += dt;
			const t = Math.min((flight.elapsed * 1000) / DESCENT_MS, 1);
			// Aim at the tunnel first, then fall into it.
			const aim = easeInOut(Math.min(t / 0.45, 1));
			viewDir.copy(flight.fromDir).lerp(flight.toDir, aim).normalize();
			// Exponential, not linear: perceived zoom rate is logarithmic, so a
			// constant *ratio* per second is what reads as steady descent. A
			// linear or polynomial ease spends most of the time apparently
			// still, then lurches at the end.
			radius = D * Math.pow(1 / 3, easeInOut(t));

			if (t >= 1) {
				const id = flight.id;
				flight = null;
				// The ⅓ copy now sits exactly where the full-size one began, so
				// stepping down a level is just putting the camera back.
				radius = D;
				opts.onArrive?.(id);
			}
		} else if (!reduced) {
			// Idle drift, plus a lean toward the pointer.
			spin.ty += dt * 0.08;
			spin.tx += Math.sin(now * 0.0002) * dt * 0.02;
		}

		// Critically damped follow, so the form never snaps.
		const k = 1 - Math.exp(-dt * 3.2);
		spin.x += (spin.tx - spin.x) * k;
		spin.y += (spin.ty - spin.y) * k;
		form.rotation.set(spin.x, spin.y, 0);

		camera.position.copy(viewDir).multiplyScalar(radius);
		camera.lookAt(0, 0, 0);

		// Hover test. Skipped mid-flight: the pointer is meaningless then.
		if (!flight && hasPointer) {
			raycaster.setFromCamera(pointer, camera);
			const hit = raycaster.intersectObjects(
				gates.map((g) => g.mesh),
				false,
			)[0];
			setHover((hit?.object.userData.gate as ApertureId) ?? null);
		}

		// With no text on screen, an untouched page has to advertise itself:
		// after a few idle seconds the nearest aperture breathes.
		const idle = (now - idleSince) / 1000;
		for (const g of gates) {
			const isHot = g.id === hovered;
			let target = isHot ? 1.5 : hovered ? 0.14 : g.base;
			if (!hovered && idle > 4) {
				// Breathe on whichever aperture currently faces the viewer.
				const facing = g.axis.clone().applyQuaternion(form.quaternion).dot(viewDir);
				if (facing > 0.55) target += 0.55 * (0.5 + 0.5 * Math.sin(now * 0.0022));
			}
			if (flight) target = g.id === flight.id ? 1.8 : 0.05;
			g.glow += (target - g.glow) * (1 - Math.exp(-dt * 7));
			g.mesh.material.uniforms.uOpacity.value = g.glow;
		}

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
	// Paint one frame synchronously: background tabs suspend rAF, and a
	// rAF-gated reveal would leave the canvas blank there.
	step(0);

	const ro = new ResizeObserver(resize);
	ro.observe(canvas);
	const onVis = () => (document.hidden ? stop() : start());
	document.addEventListener('visibilitychange', onVis);
	start();

	return {
		/** Trigger a descent programmatically (e.g. from a keyboard shortcut). */
		enter: begin,
		setReducedMotion(v: boolean) {
			reduced = v;
		},
		start,
		stop,
		step,
		internals: { renderer, scene, camera, mesh, form, gates, total },
		dispose() {
			stop();
			ro.disconnect();
			document.removeEventListener('visibilitychange', onVis);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('click', onClick);
			window.removeEventListener('keydown', onKey);
			box.dispose();
			material.dispose();
			voidGeo.dispose();
			voidMat.dispose();
			gates.forEach((g) => (g.mesh.geometry.dispose(), g.mesh.material.dispose()));
			renderer.dispose();
		},
	};
}
