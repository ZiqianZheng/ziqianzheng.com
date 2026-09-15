/**
 * The shared architectural material: ambient occlusion and painterly edge
 * lines, computed analytically from each box's own face coordinates.
 *
 * These two effects are what make untextured boxes read as architecture rather
 * than cardboard, and both are normally post-processing passes. But every piece
 * in this world is a unit box, so the distance from a fragment to its face
 * border is just `(0.5 - |localPos|)` scaled by the instance's size — exact,
 * free, and without the noise a screen-space AO pass would add.
 *
 * The edge is a narrow dark core with a faint bright halo just inside it. That
 * profile, rather than a uniform outline, is what reads as painterly instead of
 * cartoon.
 */

import * as THREE from 'three';
import { SHADOW } from './palette';

export type ArchMaterialOptions = {
	/** World-space width of the edge line. */
	edgeWidth?: number;
	/** How far the corner darkening reaches, in world units. */
	aoRadius?: number;
	/** Peak darkening at a border, 0–1. */
	aoStrength?: number;
	/** How strongly the edge core tints toward shadow, 0–1. */
	edgeStrength?: number;
};

export function createArchMaterial(opts: ArchMaterialOptions = {}) {
	const material = new THREE.MeshLambertMaterial();

	material.onBeforeCompile = (shader) => {
		shader.uniforms.uEdgeWidth = { value: opts.edgeWidth ?? 0.18 };
		shader.uniforms.uEdgeColor = { value: new THREE.Color(SHADOW) };
		shader.uniforms.uEdgeStrength = { value: opts.edgeStrength ?? 0.34 };
		shader.uniforms.uAoRadius = { value: opts.aoRadius ?? 3.0 };
		shader.uniforms.uAoStrength = { value: opts.aoStrength ?? 0.15 };

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
				uniform float uEdgeStrength;
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

					vec2 d = (0.5 - abs(p)) * s;
					float e = min(d.x, d.y);
					float small = min(s.x, s.y);

					// Clamp both effects relative to the face, so a slender piece
					// isn't swallowed whole by a line sized for a large slab.
					float w = min(uEdgeWidth, 0.16 * small);
					float r = min(uAoRadius, 0.34 * small);

					gl_FragColor.rgb *= mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, r, e));

					float halo = smoothstep(w, w * 2.4, e) * (1.0 - smoothstep(w * 2.4, w * 4.5, e));
					gl_FragColor.rgb *= mix(1.0, 1.05, halo);

					float core = 1.0 - smoothstep(w * 0.45, w, e);
					gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdgeColor, core * uEdgeStrength);
				}
				#include <fog_fragment>`,
			);
	};

	return material;
}
